<?php

namespace App\Services\Wallet;

use App\Enums\Currency;
use App\Enums\HoldStatus;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Models\GameRoom;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletHold;
use App\Models\WalletTransaction;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

class WalletService
{
    public function __construct(private readonly LedgerService $ledger) {}

    public function for(User $user, Currency $currency, WalletType $type = WalletType::Player): Wallet
    {
        return $this->findOrCreate(['user_id' => $user->id, 'currency' => $currency->value, 'type' => $type->value]);
    }

    public function system(WalletType $type, Currency $currency): Wallet
    {
        return $this->findOrCreate(
            ['system_key' => $type->value.':'.$currency->value],
            ['currency' => $currency->value, 'type' => $type->value],
        );
    }

    /**
     * Race-safe get-or-create: read first (hot path), insert inside a
     * savepoint if missing, and on a unique-key race fall back to a locking
     * read, which always sees the row committed by the competing request.
     *
     * @param  array<string, mixed>  $keys
     * @param  array<string, mixed>  $values
     */
    private function findOrCreate(array $keys, array $values = []): Wallet
    {
        $existing = Wallet::query()->where($keys)->first();

        if ($existing) {
            return $existing;
        }

        try {
            return DB::transaction(fn () => Wallet::query()->create($keys + $values));
        } catch (UniqueConstraintViolationException) {
            return Wallet::query()->where($keys)->sharedLock()->firstOrFail();
        }
    }

    public function escrow(Currency $currency): Wallet
    {
        return $this->system(WalletType::Escrow, $currency);
    }

    public function platform(Currency $currency): Wallet
    {
        return $this->system(WalletType::Platform, $currency);
    }

    /**
     * Create the default wallets for a user based on role.
     */
    public function provision(User $user): void
    {
        foreach (Currency::cases() as $currency) {
            $this->for($user, $currency, WalletType::Player);

            // Gold is a Single Player wallet only: never allocated or paid as commission.
            if ($currency->isSinglePlayer()) {
                continue;
            }

            if (! $user->isPlayer()) {
                $this->for($user, $currency, WalletType::Allocation);
            }

            if ($user->isAgent()) {
                $this->for($user, $currency, WalletType::Commission);
            }
        }
    }

    /**
     * Free daily Chips reward. One per UTC day, enforced by idempotency key.
     */
    public function claimDailyReward(User $user): WalletTransaction
    {
        $date = now('UTC')->toDateString();
        $amount = (int) config('pusoy.daily_chips_reward_amount') * 100;

        $transaction = $this->ledger->transfer(new TransferRequest(
            type: TransactionType::DailyReward,
            currency: Currency::CH,
            source: null,
            destination: $this->for($user, Currency::CH),
            amount: $amount,
            reason: 'Daily free Chips reward',
            actor: $user,
            idempotencyKey: "daily-reward:{$user->id}:{$date}",
            relatedPlayerId: $user->id,
        ));

        $user->profile()->updateOrCreate([], ['last_daily_reward_on' => $date]);

        return $transaction;
    }

    /**
     * Ledger reconciliation: every wallet balance must equal the net of its
     * ledger movements, and escrow must equal active holds + room banks.
     *
     * @return array{ok: bool, wallets_checked: int, mismatches: list<array<string, mixed>>, escrow: array<string, array<string, int>>}
     */
    public function reconcile(): array
    {
        $incoming = DB::table('wallet_transactions')->selectRaw('destination_wallet_id as id, SUM(amount) as total')
            ->whereNotNull('destination_wallet_id')->groupBy('destination_wallet_id')->pluck('total', 'id');
        $outgoing = DB::table('wallet_transactions')->selectRaw('source_wallet_id as id, SUM(amount) as total')
            ->whereNotNull('source_wallet_id')->groupBy('source_wallet_id')->pluck('total', 'id');

        $mismatches = [];
        $count = 0;

        foreach (Wallet::query()->cursor() as $wallet) {
            $count++;
            $expected = (int) ($incoming[$wallet->id] ?? 0) - (int) ($outgoing[$wallet->id] ?? 0);

            if ($expected !== $wallet->balance) {
                $mismatches[] = ['wallet_id' => $wallet->id, 'balance' => $wallet->balance, 'ledger' => $expected];
            }
        }

        $escrow = [];

        foreach (Currency::cases() as $currency) {
            $held = (int) WalletHold::query()->where('currency', $currency->value)->where('status', HoldStatus::Held->value)->sum('amount');
            $banks = (int) GameRoom::query()->where('currency', $currency->value)->sum('carry_over_amount');
            // Single Player Round Bank reserves (player + house) are Gold.
            $practice = (int) DB::table('practice_games')
                ->join('practice_matches', 'practice_matches.id', '=', 'practice_games.practice_match_id')
                ->where('practice_games.reserve_status', 'held')->where('practice_matches.currency', $currency->value)
                ->sum(DB::raw('practice_games.player_reserve + practice_games.house_reserve'));
            $expected = $held + $banks + $practice;
            $balance = (int) Wallet::query()->where('system_key', WalletType::Escrow->value.':'.$currency->value)->value('balance');
            $escrow[$currency->value] = ['balance' => $balance, 'expected' => $expected];

            if ($balance !== $expected) {
                $mismatches[] = ['escrow' => $currency->value, 'balance' => $balance, 'expected' => $expected];
            }
        }

        return ['ok' => $mismatches === [], 'wallets_checked' => $count, 'mismatches' => $mismatches, 'escrow' => $escrow];
    }
}
