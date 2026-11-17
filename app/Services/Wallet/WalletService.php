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
use Illuminate\Support\Facades\DB;

class WalletService
{
    public function __construct(private readonly LedgerService $ledger) {}

    public function for(User $user, Currency $currency, WalletType $type = WalletType::Player): Wallet
    {
        return Wallet::query()->createOrFirst(
            ['user_id' => $user->id, 'currency' => $currency->value, 'type' => $type->value],
        );
    }

    public function system(WalletType $type, Currency $currency): Wallet
    {
        return Wallet::query()->createOrFirst(
            ['system_key' => $type->value.':'.$currency->value],
            ['currency' => $currency->value, 'type' => $type->value],
        );
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

            if (! $user->isPlayer()) {
                $this->for($user, $currency, WalletType::Allocation);
            }

            if ($user->isAgent()) {
                $this->for($user, $currency, WalletType::Commission);
            }
        }
    }

    /**
     * Free daily VC reward. One per UTC day, enforced by idempotency key.
     */
    public function claimDailyReward(User $user): WalletTransaction
    {
        $date = now('UTC')->toDateString();
        $amount = (int) config('pusoy.daily_vc_reward_amount') * 100;

        $transaction = $this->ledger->transfer(new TransferRequest(
            type: TransactionType::DailyReward,
            currency: Currency::VC,
            source: null,
            destination: $this->for($user, Currency::VC),
            amount: $amount,
            reason: 'Daily free VC reward',
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
            $balance = (int) Wallet::query()->where('system_key', WalletType::Escrow->value.':'.$currency->value)->value('balance');
            $escrow[$currency->value] = ['balance' => $balance, 'expected' => $held + $banks];

            if ($balance !== $held + $banks) {
                $mismatches[] = ['escrow' => $currency->value, 'balance' => $balance, 'expected' => $held + $banks];
            }
        }

        return ['ok' => $mismatches === [], 'wallets_checked' => $count, 'mismatches' => $mismatches, 'escrow' => $escrow];
    }
}
