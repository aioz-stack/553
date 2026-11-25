<?php

namespace App\Services\Wallet;

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Models\KeyExchange;
use App\Models\KeyExchangeShare;
use App\Models\RevenueConversion;
use App\Models\User;
use App\Models\Wallet;
use App\Services\Agent\TeamService;
use App\Services\Audit\AuditLogger;
use App\Services\System\MaintenanceService;
use App\Support\Points;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Self Convert Revenue to Chips (Admin, Incorporator and Master Agent Overview).
 *
 * Shop revenue shares (KeyExchangeService) are paid into the account's Revenue wallet
 * (WalletType::Share, Chips currency). Converting moves the amount the user enters (at least
 * pusoy.revenue_conversion.min_amount, at most the Available Revenue) into the account's own
 * Chips wallet (My Total Chips Amount) at the configured rate.
 *
 *  - Server-side only: the amount is re-checked against the locked balance here; the rate and the
 *    Chips are computed here, never sent by the client.
 *  - One database transaction: the user row and both wallets are locked, the Revenue is debited,
 *    the Chips credited and the record written; any failure rolls everything back.
 *  - Idempotent per (user, request_id): a repeated request returns the first conversion. The
 *    Revenue converted is gone from the Revenue wallet, so it can never be converted twice.
 *  - Rate 1:1 (10000 bps) is one ledger transfer Revenue → Chips. Any other rate burns the Revenue
 *    and mints the Chips as two ledger entries, so the ledger stays reconciled.
 */
class RevenueConversionService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    /** Chips per 1 Revenue in basis points (10000 = 1:1), from config pusoy.revenue_conversion. */
    public static function rateBps(): int
    {
        $bps = (int) config('pusoy.revenue_conversion.rate_bps', 10000);

        return $bps > 0 ? $bps : 10000;
    }

    /** Smallest amount of Revenue one conversion may move (minor units; default 20.00). */
    public static function minAmount(): int
    {
        return max(1, (int) round(((float) config('pusoy.revenue_conversion.min_amount', 20)) * 100));
    }

    public static function chipsFor(int $revenue): int
    {
        return intdiv($revenue * self::rateBps(), 10000);
    }

    /**
     * What the confirmation modal shows (all from the server).
     *
     * @return array<string, mixed>
     */
    public function summary(User $user): array
    {
        $this->authorize($user);
        $available = (int) $this->revenueWallet($user)->balance;
        $chips = (int) $this->chipsWallet($user)->balance;
        $earned = (int) KeyExchangeShare::query()->where('recipient_user_id', $user->id)
            ->whereHas('exchange', fn ($q) => $q->where('status', KeyExchange::COMPLETED))->sum('amount');

        return [
            'total_revenue' => Points::decimal($earned),
            'available_revenue' => Points::decimal($available),
            'my_chips' => Points::decimal($chips),
            'chips_to_receive' => Points::decimal(self::chipsFor($available)),
            'min_amount' => Points::decimal(self::minAmount()),
            'rate' => $this->rateLabel(),
            'rate_bps' => self::rateBps(),
            'converted_total' => Points::decimal((int) RevenueConversion::query()->where('user_id', $user->id)->sum('revenue_amount')),
            'can_convert' => $available >= self::minAmount(),
            'recent' => RevenueConversion::query()->where('user_id', $user->id)->latest('id')->limit(10)->get()
                ->map(fn (RevenueConversion $c) => $this->present($c))->all(),
        ];
    }

    /** Convert $amount (minor units) of the user's Revenue into their own Chips. */
    public function convert(User $user, int $amount, string $requestId): RevenueConversion
    {
        $this->authorize($user);
        $key = "revenue-convert:{$user->id}:{$requestId}";

        return DB::transaction(function () use ($user, $amount, $requestId, $key) {
            // Serialize this account's conversions (double clicks, two tabs, retries).
            User::query()->whereKey($user->id)->lockForUpdate()->first();
            app(MaintenanceService::class)->assertTransactionsAllowed($user);

            if ($done = RevenueConversion::query()->where('user_id', $user->id)->where('idempotency_key', $requestId)->first()) {
                return $done;
            }

            $revenueWallet = Wallet::query()->whereKey($this->revenueWallet($user)->id)->lockForUpdate()->firstOrFail();
            $chipsWallet = Wallet::query()->whereKey($this->chipsWallet($user)->id)->lockForUpdate()->firstOrFail();
            $before = (int) $revenueWallet->balance;
            $revenue = $amount;

            if ($revenue < self::minAmount()) {
                throw new BusinessRuleException('The minimum conversion is '.Points::format(self::minAmount()).' Revenue.', 422, 'below_minimum');
            }
            if ($revenue > $before) {
                throw new BusinessRuleException('The amount is more than your Available Revenue.', 422, 'insufficient_revenue');
            }
            $chips = self::chipsFor($revenue);

            $chipsBefore = (int) $chipsWallet->balance;
            $rate = self::rateBps();
            $reason = 'Self Convert Revenue to Chips ('.$this->rateLabel().')';
            $move = fn (?Wallet $from, ?Wallet $to, int $amount, string $idem) => $this->ledger->transfer(new TransferRequest(
                type: TransactionType::RevenueConversion,
                currency: Currency::CH,
                source: $from,
                destination: $to,
                amount: $amount,
                reason: $reason,
                actor: $user,
                idempotencyKey: $idem,
                relatedAgentId: $user->isAgent() ? $user->agent?->id : null,
                metadata: ['revenue' => Points::decimal($revenue), 'chips' => Points::decimal($chips), 'rate_bps' => $rate],
            ));

            if ($rate === 10000) {
                $tx = $move($revenueWallet, $chipsWallet, $revenue, $key);
            } else {
                // Burn the Revenue, mint the Chips: both entries in this same transaction.
                $move($revenueWallet, null, $revenue, "{$key}:out");
                $tx = $move(null, $chipsWallet, $chips, "{$key}:in");
            }

            $revenueAfter = (int) $revenueWallet->fresh()->balance;
            $chipsAfter = (int) $chipsWallet->fresh()->balance;

            $conversion = RevenueConversion::query()->create([
                'reference' => 'RV'.strtoupper((string) Str::ulid()),
                'user_id' => $user->id,
                'role' => $user->role->value,
                'agent_level' => $user->isAgent() ? $user->agent?->level?->value : null,
                'revenue_amount' => $revenue,
                'rate_bps' => $rate,
                'chips_amount' => $chips,
                'revenue_before' => $before,
                'revenue_after' => $revenueAfter,
                'chips_before' => $chipsBefore,
                'chips_after' => $chipsAfter,
                'status' => RevenueConversion::COMPLETED,
                'idempotency_key' => $requestId,
                'wallet_transaction_id' => $tx->id,
            ]);

            AuditLogger::log($user, 'revenue.converted', $user, ['revenue' => $before, 'chips' => $chipsBefore], [
                'revenue' => $revenueAfter, 'chips' => $chipsAfter, 'converted' => $revenue, 'credited' => $chips, 'rate_bps' => $rate, 'reference' => $conversion->reference,
            ]);

            return $conversion;
        });
    }

    /** @return array<string, mixed> */
    public function present(RevenueConversion $c): array
    {
        return [
            'id' => $c->id,
            'reference' => $c->reference,
            'role' => $c->role,
            'revenue_converted' => Points::decimal($c->revenue_amount),
            'rate' => $this->rateLabel($c->rate_bps),
            'chips_credited' => Points::decimal($c->chips_amount),
            'revenue_before' => Points::decimal($c->revenue_before),
            'revenue_after' => Points::decimal($c->revenue_after),
            'chips_before' => Points::decimal($c->chips_before),
            'chips_after' => Points::decimal($c->chips_after),
            'status' => $c->status,
            'created_at' => $c->created_at?->toIso8601String(),
        ];
    }

    private function rateLabel(?int $bps = null): string
    {
        $bps ??= self::rateBps();
        $chips = rtrim(rtrim(number_format($bps / 10000, 4, '.', ''), '0'), '.');

        return "1 Revenue = {$chips} Chip".($bps === 10000 ? '' : 's');
    }

    private function revenueWallet(User $user): Wallet
    {
        return $this->wallets->for($user, Currency::CH, WalletType::Share);
    }

    private function chipsWallet(User $user): Wallet
    {
        return $this->wallets->for($user, Currency::CH, WalletType::Allocation);
    }

    private function authorize(User $user): void
    {
        if (! $user->isActive() || ! TeamService::allowed($user)) {
            throw new BusinessRuleException('Only Admins, Incorporators and Master Agents can convert Revenue.', 403, 'forbidden');
        }
    }
}
