<?php

namespace App\Services\Game;

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Exceptions\BusinessRuleException;
use App\Models\GamePlayer;
use App\Models\GameRoom;
use App\Models\GameTable;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Support\Collection;

/**
 * Multiplayer lobby entry rules (Create Lobby tiers). One place for every check, used on create,
 * join, Quick Join, bet change, Start and at the moment the game starts:
 *
 *   Tier (Minimum Entry) │ Allowed bets  │ Keys fee
 *   100 Chips            │ 5 / 10 / 15   │ 1
 *   500 Chips            │ 20 / 30 / 40  │ 2
 *   1,000 Chips          │ 50 / 75 / 100 │ 5
 *
 *  - The player selects one of the tier's bets and must hold Chips ≥ the tier's Minimum Entry AND
 *    ≥ 2× the selected bet (player_bet_multiple), plus Keys ≥ the fee.
 *  - The Keys fee is deducted from every player in the same database transaction that starts the
 *    game (never on join), once per player and table (idempotency key lobby-keys:{table}:{user}),
 *    into the platform Keys wallet, with a ledger entry (LOBBY_ENTRY_FEE).
 *  - If the match ends before any round was completed, the fees are refunded (LOBBY_ENTRY_REFUND,
 *    once per payer) — the configured cancellation policy.
 */
class LobbyEntryService
{
    public function __construct(
        private readonly WalletService $wallets,
        private readonly LedgerService $ledger,
    ) {}

    /**
     * The tiers: Minimum Entry (whole Chips) => [bets (whole Chips), keys].
     *
     * @return array<int, array{bets: list<int>, keys: int}>
     */
    public static function tiers(): array
    {
        $out = [];
        foreach ((array) config('pusoy.lobby.tiers', []) as $entry => $tier) {
            $out[(int) $entry] = ['bets' => array_values(array_map('intval', $tier['bets'] ?? [])), 'keys' => (int) ($tier['keys'] ?? 0)];
        }
        ksort($out);

        return $out;
    }

    /** @return list<int> */
    public static function minEntries(): array
    {
        return array_keys(self::tiers());
    }

    /** @return array{bets: list<int>, keys: int} */
    public static function tier(int $minEntry): array
    {
        return self::tiers()[$minEntry] ?? throw new BusinessRuleException('Choose a Minimum Entry of '.implode(', ', array_map(fn ($e) => number_format($e), self::minEntries())).' Chips.', 422, 'invalid_tier');
    }

    public static function betMultiple(): int
    {
        return max(1, (int) config('pusoy.lobby.player_bet_multiple', 2));
    }

    /** Keys fee of a lobby, in minor units (Keys are stored like Chips, 2 decimals). */
    public static function keyFee(GameRoom $room): int
    {
        return (int) $room->entry_keys * Points::SCALE;
    }

    /** Chips a player must hold to play this bet here: max(Minimum Entry, 2 × bet). Minor units. */
    public static function requiredChips(GameRoom $room, int $bet): int
    {
        return max((int) $room->min_entry, $bet * self::betMultiple());
    }

    /** The player's selected bet, or the lobby's smallest one. Minor units. */
    public static function betOf(GameRoom $room, ?GamePlayer $player): int
    {
        $bets = $room->betChips() ?? [$room->minBet()];

        return $player?->selected_bet && in_array((int) $player->selected_bet, $bets, true) ? (int) $player->selected_bet : min($bets);
    }

    /** A bet (minor units) must be one of the lobby's allowed bets. */
    public function assertBet(GameRoom $room, int $bet): void
    {
        $bets = $room->betChips() ?? [$room->minBet()];
        if (! in_array($bet, $bets, true)) {
            throw new BusinessRuleException('Choose one of this lobby\'s bets: '.implode(' / ', array_map(fn ($b) => Points::decimal($b), $bets)).' Chips.', 422, 'invalid_bet');
        }
    }

    /**
     * Throws with a clear message unless $user may play $bet in $room now: allowed bet, Chips ≥
     * max(Minimum Entry, 2× bet) and Keys ≥ the fee. With $lock the wallets are read FOR UPDATE.
     */
    public function assertCanPlay(User $user, GameRoom $room, int $bet, bool $lock = false): void
    {
        $this->assertBet($room, $bet);
        if ($problem = $this->problem($user, $room, $bet, $lock)) {
            throw new BusinessRuleException($problem['message'], 422, $problem['code']);
        }
    }

    /**
     * @return array{code: string, message: string}|null
     */
    public function problem(User $user, GameRoom $room, int $bet, bool $lock = false): ?array
    {
        $chips = $this->balance($user, Currency::CH, $lock);
        $needChips = self::requiredChips($room, $bet);
        if ($chips < $needChips) {
            $why = $needChips > (int) $room->min_entry
                ? '2× your '.Points::format($bet).' Chips bet'
                : 'this lobby\'s Minimum Entry';

            return ['code' => 'insufficient_balance', 'message' => 'You need at least '.Points::format($needChips)." Chips ({$why}). You have ".Points::format($chips).'.'];
        }

        $fee = self::keyFee($room);
        if ($fee > 0 && ($keys = $this->balance($user, Currency::KY, $lock)) < $fee) {
            return ['code' => 'insufficient_keys', 'message' => 'You need '.$this->keysText($room)." to play this lobby. You have ".Points::format($keys).' Keys.'];
        }

        return null;
    }

    /**
     * Players of $table who no longer meet the requirements (checked right before the start).
     *
     * @param  Collection<int, GamePlayer>  $players
     * @return list<array{user_id: int, username: ?string, code: string, message: string}>
     */
    public function failing(GameRoom $room, Collection $players, bool $lock = false): array
    {
        $out = [];
        foreach ($players as $p) {
            $user = $p->user ?? User::query()->find($p->user_id);
            if ($user && ($problem = $this->problem($user, $room, self::betOf($room, $p), $lock))) {
                $out[] = ['user_id' => $p->user_id, 'username' => $user->username] + $problem;
            }
        }

        return $out;
    }

    /**
     * Deduct the Keys fee from every player of $table (inside the caller's transaction that starts
     * the game). Once per player and table: a retry finds the same ledger entry and does nothing.
     *
     * @param  Collection<int, GamePlayer>  $players
     */
    public function chargeKeys(GameTable $table, GameRoom $room, Collection $players): void
    {
        $fee = self::keyFee($room);
        if ($fee <= 0) {
            return;
        }

        foreach ($players->sortBy('user_id') as $p) {
            $user = $p->user ?? User::query()->findOrFail($p->user_id);
            $this->ledger->transfer(new TransferRequest(
                type: TransactionType::LobbyEntryFee,
                currency: Currency::KY,
                source: $this->wallets->for($user, Currency::KY),
                destination: $this->wallets->platform(Currency::KY),
                amount: $fee,
                reason: "Lobby entry: {$room->name} (#{$room->lobby_code}) — ".$this->keysText($room),
                actor: $user,
                idempotencyKey: "lobby-keys:{$table->id}:{$user->id}",
                relatedPlayerId: $user->id,
                metadata: ['room_id' => $room->id, 'table_id' => $table->id, 'lobby_code' => $room->lobby_code, 'keys' => $room->entry_keys],
            ));
        }

        AuditLogger::log(null, 'lobby.keys_charged', $room, null, ['table_id' => $table->id, 'keys_each' => $room->entry_keys, 'players' => $players->pluck('user_id')->values()->all()]);
    }

    /**
     * Refund every Keys fee paid for $table (match ended before any round was completed). Once per
     * payer; players who already left are refunded too.
     */
    public function refundKeys(GameTable $table, string $reason): int
    {
        $paid = WalletTransaction::query()->where('type', TransactionType::LobbyEntryFee->value)
            ->where('idempotency_key', 'like', "lobby-keys:{$table->id}:%")->get();
        $count = 0;

        foreach ($paid as $tx) {
            $userId = (int) $tx->related_player_id;
            $user = User::query()->find($userId);
            if (! $user) {
                continue;
            }
            $this->ledger->transfer(new TransferRequest(
                type: TransactionType::LobbyEntryRefund,
                currency: Currency::KY,
                source: $this->wallets->platform(Currency::KY),
                destination: $this->wallets->for($user, Currency::KY),
                amount: (int) $tx->amount,
                reason: 'Lobby entry refunded: the match ended before any round was completed',
                idempotencyKey: "lobby-keys-refund:{$table->id}:{$userId}",
                relatedPlayerId: $userId,
                metadata: ['table_id' => $table->id, 'refund_of' => $tx->reference, 'reason' => $reason],
            ));
            $count++;
        }

        if ($count > 0) {
            AuditLogger::log(null, 'lobby.keys_refunded', $table->room, null, ['table_id' => $table->id, 'players' => $count, 'reason' => $reason]);
        }

        return $count;
    }

    public function keysText(GameRoom $room): string
    {
        return $room->entry_keys.' '.((int) $room->entry_keys === 1 ? 'Key' : 'Keys');
    }

    private function balance(User $user, Currency $currency, bool $lock): int
    {
        $wallet = $this->wallets->for($user, $currency);

        return $lock ? (int) Wallet::query()->whereKey($wallet->id)->lockForUpdate()->value('balance') : (int) $wallet->balance;
    }
}
