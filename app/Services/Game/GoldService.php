<?php

namespace App\Services\Game;

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Events\Game\GameEvents;
use App\Events\Game\UserEvent;
use App\Exceptions\BusinessRuleException;
use App\Models\PracticeGame;
use App\Models\PracticeMatch;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Support\Facades\DB;

/**
 * Single Player Gold Wallet and the Out of Gold recovery (Single Player only).
 *
 * Gold (GD) is won and lost automatically by every settled Single Player round
 * (PracticeService reserves the worst case into escrow, then pays out once per
 * round). Gold is Single Player only: no Multiplayer room, lobby, allocation or
 * payout accepts it, and it can never be mixed with or turned into Chips.
 *
 * Out of Gold: the player can no longer keep playing Single Player —
 *  - during a match: Gold cannot cover the next round's smallest reserve
 *    (2 × the tier's lowest bet, or 2 × three lowest bets when you bank);
 *  - between matches: Gold is below the lowest tier's minimum (Beginner).
 * Zero and negative are always Out of Gold. A held round reserve never counts
 * as Out of Gold (the round settles first).
 *
 * The free 1,000 Gold is only credited when the player presses Claim and only
 * while they are Out of Gold (a credited claim ends that state). Claims are
 * serialised on the user row and keyed by the popup's request id, so double
 * clicks, refreshes and duplicate requests credit it once.
 */
class GoldService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    public function goldMinor(User $user): int
    {
        return (int) $this->wallets->for($user, Currency::GD)->balance;
    }

    public static function claimAmount(): int
    {
        return (int) config('pusoy.practice.out_of_gold_reward', 1_000);
    }

    /** The lowest tier's minimum Gold (points) to start a match. */
    public static function minimumToStart(): int
    {
        $mins = array_map(fn (array $t) => (int) $t['min_gold'], (array) config('pusoy.practice.tiers', []));

        return $mins === [] ? 0 : min($mins);
    }

    /** The smallest reserve (points) the next round of $match can need: 2 × lowest bet, or 2 × three lowest bets when you bank. */
    public static function nextRoundMinimum(PracticeMatch $match): int
    {
        $bets = array_map('intval', (array) config("pusoy.practice.tiers.{$match->tier}.bets", [0]));
        $bettors = PracticeMatch::bankerFor($match->rounds_played + 1) === PracticeService::PLAYER_SEAT ? count(PracticeService::BOTS) : 1;

        return min($bets) * $bettors * (int) config('pusoy.banker.reserve_multiplier', 2);
    }

    /** Whether $user can no longer keep playing Single Player (see class doc). */
    public function isOutOfGold(User $user, ?PracticeMatch $match = null): bool
    {
        if (PracticeGame::query()->where('user_id', $user->id)->where('status', PracticeGame::ARRANGING)->where('reserve_status', 'held')->exists()) {
            return false;
        }

        $gold = $this->goldMinor($user);

        if ($gold <= 0) {
            return true;
        }

        $match ??= PracticeMatch::query()->where('user_id', $user->id)->where('status', PracticeMatch::ACTIVE)->latest('id')->first();
        $needed = $match && $match->status === PracticeMatch::ACTIVE && $match->wagering
            ? self::nextRoundMinimum($match)
            : self::minimumToStart();

        return $gold < Points::toMinor($needed);
    }

    /**
     * The player's Gold Wallet as the Single Player screens see it.
     *
     * @return array<string, mixed>
     */
    public function state(User $user): array
    {
        $out = $this->isOutOfGold($user);
        $amount = self::claimAmount();
        $gold = $this->goldMinor($user);
        // Gold held for the round you are playing (returned or settled when it ends).
        $reserved = (int) PracticeGame::query()->where('practice_games.user_id', $user->id)
            ->where('practice_games.status', PracticeGame::ARRANGING)->where('practice_games.reserve_status', 'held')
            ->join('practice_matches', 'practice_matches.id', '=', 'practice_games.practice_match_id')
            ->where('practice_matches.currency', Currency::GD->value)
            ->sum('practice_games.player_reserve');

        return [
            // Spendable Gold, the Gold reserved in your open round, and the Total Amount (both).
            'gold' => Points::decimal($gold),
            'reserved' => Points::decimal($reserved),
            'total' => Points::decimal($gold + $reserved),
            'out_of_gold' => $out,
            'claim_amount' => $amount,
            'can_claim' => $out,
            'minimum_to_start' => self::minimumToStart(),
        ];
    }

    /**
     * Claim the free Gold (only when Out of Gold), credited straight into the Gold
     * wallet. Serialised on the user row; `$requestId` (one per popup) makes repeated
     * clicks, refreshes and retried requests return the same claim.
     *
     * @return array{transaction: WalletTransaction, created: bool}
     */
    public function claim(User $user, string $requestId): array
    {
        $result = DB::transaction(function () use ($user, $requestId) {
            User::query()->whereKey($user->id)->lockForUpdate()->first();
            $key = "out-of-gold:{$user->id}:{$requestId}";

            if ($done = WalletTransaction::query()->where('idempotency_key', $key)->first()) {
                return ['transaction' => $done, 'created' => false];
            }

            if (! $this->isOutOfGold($user)) {
                throw new BusinessRuleException('You still have Gold to play with. The free Gold is only for when you run out.', 409, 'not_eligible');
            }

            $number = WalletTransaction::query()->where('type', TransactionType::OutOfGoldReward->value)->where('related_player_id', $user->id)->count() + 1;
            $transaction = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::OutOfGoldReward,
                currency: Currency::GD,
                source: null,
                destination: $this->wallets->for($user, Currency::GD),
                amount: Points::toMinor(self::claimAmount()),
                reason: 'Out of Gold: free '.number_format(self::claimAmount()).' Gold',
                actor: $user,
                idempotencyKey: $key,
                relatedPlayerId: $user->id,
                metadata: ['single_player' => true, 'claim' => $number],
            ));

            AuditLogger::log($user, 'gold.claimed', $user, null, ['amount' => self::claimAmount(), 'claim' => $number, 'reference' => $transaction->reference]);

            return ['transaction' => $transaction, 'created' => true];
        });

        $this->pushBalances($user);

        return $result;
    }

    /** Push the owner's new Gold balance to their private channel only. */
    public function pushBalances(User $user): void
    {
        $balance = (int) Wallet::query()->where('user_id', $user->id)->where('currency', Currency::GD->value)->where('type', 'player')->value('balance');
        DB::afterCommit(fn () => event(new UserEvent($user->id, GameEvents::WALLET_UPDATED, ['currency' => Currency::GD->value, 'balance' => Points::decimal($balance)])));
    }
}
