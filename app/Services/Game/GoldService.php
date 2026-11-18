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
 * round). Gold Points (GP) are a separate wallet: the free Out of Gold reward,
 * convertible one way, 1:1, into Gold. Neither is cash: they can never be
 * withdrawn, redeemed or converted into CP or VC, and no Multiplayer room,
 * lobby, allocation or payout uses them.
 *
 * Out of Gold: the player can no longer keep playing Single Player —
 *  - during a match: Gold cannot cover the next round's smallest reserve
 *    (2 × the tier's lowest bet, or 2 × three lowest bets when you bank);
 *  - between matches: Gold is below the lowest tier's minimum (Beginner).
 * Zero and negative are always Out of Gold. A held round reserve never counts
 * as Out of Gold (the round settles first).
 *
 * The 1,000 Gold Points claim is only credited when the player presses Claim,
 * only while they are Out of Gold, and never while an earlier claim is still
 * unconverted. Claims are serialised on the user row and keyed per claim
 * number, so double clicks, refreshes and duplicate requests credit it once.
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

    public function pointsMinor(User $user): int
    {
        return (int) $this->wallets->for($user, Currency::GP)->balance;
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
        $points = $this->pointsMinor($user);
        $amount = self::claimAmount();

        return [
            'gold' => Points::decimal($this->goldMinor($user)),
            'gold_points' => Points::decimal($points),
            'out_of_gold' => $out,
            'claim_amount' => $amount,
            // Claimable once per bust: never while an earlier claim is still unconverted.
            'can_claim' => $out && $points < Points::toMinor($amount),
            'minimum_to_start' => self::minimumToStart(),
        ];
    }

    /**
     * Claim the free Gold Points (only when Out of Gold).
     *
     * @return array{transaction: WalletTransaction, created: bool}
     */
    public function claim(User $user): array
    {
        $result = DB::transaction(function () use ($user) {
            User::query()->whereKey($user->id)->lockForUpdate()->first();
            $wallet = $this->wallets->for($user, Currency::GP);
            $amount = Points::toMinor(self::claimAmount());

            if (! $this->isOutOfGold($user)) {
                throw new BusinessRuleException('You still have Gold to play with. The free Gold Points are only for when you run out.', 409, 'not_eligible');
            }

            $claims = WalletTransaction::query()->where('destination_wallet_id', $wallet->id)->where('type', TransactionType::GoldPointsReward->value);

            if ((int) $wallet->balance >= $amount) {
                // Already claimed and not yet converted (double click, refresh or a repeated request).
                $last = (clone $claims)->latest('id')->first();

                if ($last) {
                    return ['transaction' => $last, 'created' => false];
                }

                throw new BusinessRuleException('You already have enough Gold Points. Convert them to Gold to keep playing.', 409, 'not_eligible');
            }

            $number = $claims->count() + 1;
            $transaction = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::GoldPointsReward,
                currency: Currency::GP,
                source: null,
                destination: $wallet,
                amount: $amount,
                reason: 'Out of Gold: free '.number_format(self::claimAmount()).' Gold Points',
                actor: $user,
                idempotencyKey: "gold-points-claim:{$user->id}:{$number}",
                relatedPlayerId: $user->id,
                metadata: ['single_player' => true, 'claim' => $number],
            ));

            AuditLogger::log($user, 'gold_points.claimed', $user, null, ['amount' => self::claimAmount(), 'claim' => $number, 'reference' => $transaction->reference]);

            return ['transaction' => $transaction, 'created' => true];
        });

        $this->pushBalances($user);

        return $result;
    }

    /**
     * Convert Gold Points into Gold, one way, 1:1 (all of them when $points is null).
     * Both legs commit together; a repeated $requestId never converts twice.
     */
    public function convert(User $user, ?int $points, string $requestId): int
    {
        $converted = DB::transaction(function () use ($user, $points, $requestId) {
            User::query()->whereKey($user->id)->lockForUpdate()->first();
            $from = $this->wallets->for($user, Currency::GP);
            $to = $this->wallets->for($user, Currency::GD);
            $key = "gold-convert:{$user->id}:{$requestId}";

            if ($done = WalletTransaction::query()->where('idempotency_key', "{$key}:in")->first()) {
                return (int) $done->amount;
            }

            $amount = $points === null ? (int) $from->balance : Points::toMinor($points);

            if ($amount <= 0) {
                throw new BusinessRuleException('You have no Gold Points to convert.', 422, 'nothing_to_convert');
            }

            if ($amount > (int) $from->balance) {
                throw new BusinessRuleException('You do not have that many Gold Points.', 422, 'insufficient_gold_points');
            }

            $label = Points::format($amount).' Gold Points converted to Gold (1:1)';
            $this->ledger->transfer(new TransferRequest(TransactionType::GoldConversion, Currency::GP, $from, null, $amount, $label, $user, "{$key}:out", $user->id, metadata: ['single_player' => true]));
            $this->ledger->transfer(new TransferRequest(TransactionType::GoldConversion, Currency::GD, null, $to, $amount, $label, $user, "{$key}:in", $user->id, metadata: ['single_player' => true]));

            AuditLogger::log($user, 'gold_points.converted', $user, null, ['amount' => Points::decimal($amount)]);

            return $amount;
        });

        $this->pushBalances($user);

        return $converted;
    }

    /** Push the owner's new Gold and Gold Points balances to their private channel only. */
    public function pushBalances(User $user): void
    {
        foreach ([Currency::GD, Currency::GP] as $currency) {
            $balance = (int) Wallet::query()->where('user_id', $user->id)->where('currency', $currency->value)->where('type', 'player')->value('balance');
            DB::afterCommit(fn () => event(new UserEvent($user->id, GameEvents::WALLET_UPDATED, ['currency' => $currency->value, 'balance' => Points::decimal($balance)])));
        }
    }
}
