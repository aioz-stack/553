<?php

namespace App\Services\Wallet;

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Models\AdministratorLimit;
use App\Models\ChipLoad;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletAdjustment;
use App\Models\WalletAllocation;
use App\Models\WalletTransaction;
use App\Notifications\PointsReceived;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * Controlled Chips loading down the hierarchy:
 *
 *   Super Admin   --issues (issue())--> own Chips wallet (the only way Chips are created)
 *   Super Admin / Administrator --from own Chips wallet--> agent Chips wallet or player wallet
 *   Agent         --from own Chips wallet--> wallets of the agent's OWN players only
 *
 * Players can never credit themselves. Every Chips load also writes a Load Logs row
 * (chip_loads) pointing at its ledger transaction.
 */
class AllocationService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    public function allocate(
        User $actor,
        User $recipient,
        Currency $currency,
        int $amount,
        ?string $reason = null,
        ?string $idempotencyKey = null,
        // A Loader Account acting for $actor (its employer Admin): $actor's rules and Chips, the
        // Loader recorded as the one who processed it (ledger created_by, Load Logs, audit log).
        ?User $processedBy = null,
    ): WalletTransaction {
        $processor = $processedBy ?? $actor;

        if ($actor->id === $recipient->id) {
            throw new BusinessRuleException('You cannot allocate points to yourself.', 403, 'forbidden');
        }

        if (! $recipient->isActive()) {
            throw new BusinessRuleException('The recipient account is suspended.');
        }

        [$type, $source, $targetType] = $this->resolveRoute($actor, $recipient, $currency, $amount);
        $destination = $this->wallets->for($recipient, $currency, $targetType);

        return DB::transaction(function () use ($actor, $recipient, $currency, $amount, $reason, $idempotencyKey, $type, $source, $destination, $targetType, $processor) {
            // Maintenance (Full / Agents-Players): no Chips move for agents or players.
            app(\App\Services\System\MaintenanceService::class)->assertTransactionsAllowed($actor, $recipient);
            $transaction = $this->ledger->transfer(new TransferRequest(
                type: $type,
                currency: $currency,
                source: $source,
                destination: $destination,
                amount: $amount,
                reason: $reason,
                actor: $processor,
                idempotencyKey: $idempotencyKey ? "alloc:{$actor->id}:{$idempotencyKey}" : null,
                relatedPlayerId: $recipient->isPlayer() ? $recipient->id : null,
                relatedAgentId: $actor->isAgent() ? $actor->id : ($recipient->isAgent() ? $recipient->id : null),
                approvedBy: $processor->id,
                metadata: $processor->id !== $actor->id ? ['funds_from' => $actor->id, 'processed_by' => $processor->id] : [],
            ));

            if ($transaction->wasRecentlyCreated) {
                WalletAllocation::create([
                    'wallet_transaction_id' => $transaction->id,
                    'allocator_id' => $actor->id,
                    'recipient_id' => $recipient->id,
                    'currency' => $currency,
                    'target_type' => $targetType->value,
                    'amount' => $amount,
                    'reason' => $reason,
                ]);

                AuditLogger::log($processor, 'wallet.allocate', $transaction, null, [
                    'funds_from' => $actor->id,
                    'recipient_id' => $recipient->id,
                    'currency' => $currency->value,
                    'amount' => $amount,
                    'target' => $targetType->value,
                ]);

                $recipient->notify((new PointsReceived($transaction))->afterCommit());

                if ($currency === Currency::CH) {
                    self::logLoad(ChipLoad::LOAD, $actor, $recipient, $amount, $transaction, $processor, $reason);
                }
            }

            return $transaction;
        });
    }

    /**
     * Super Admin creates new Chips into their own Chips wallet (the platform's only issuance
     * of Chips; every load then draws on a real balance).
     */
    public function issue(User $actor, int $amount, ?string $reason = null, ?string $idempotencyKey = null): WalletTransaction
    {
        if (! $actor->isSuperAdmin()) {
            throw new BusinessRuleException('Only a Super Admin can issue new Chips.', 403, 'forbidden');
        }

        return DB::transaction(function () use ($actor, $amount, $reason, $idempotencyKey) {
            $transaction = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::AdminAllocation,
                currency: Currency::CH,
                source: null,
                destination: $this->wallets->for($actor, Currency::CH, WalletType::Allocation),
                amount: $amount,
                reason: $reason ?? 'Chips issued',
                actor: $actor,
                idempotencyKey: $idempotencyKey ? "issue:{$actor->id}:{$idempotencyKey}" : null,
                approvedBy: $actor->id,
            ));

            if ($transaction->wasRecentlyCreated) {
                self::logLoad(ChipLoad::LOAD, null, $actor, $amount, $transaction, $actor, $reason ?? 'Chips issued');
                AuditLogger::log($actor, 'wallet.issue', $transaction, null, ['amount' => $amount]);
            }

            return $transaction;
        });
    }

    /** One Load Logs row for a completed Chips movement. */
    public static function logLoad(string $direction, ?User $sender, User $account, int $amount, WalletTransaction $transaction, User $processedBy, ?string $note): ChipLoad
    {
        return ChipLoad::query()->firstOrCreate(['wallet_transaction_id' => $transaction->id], [
            'reference' => 'LD'.strtoupper((string) \Illuminate\Support\Str::ulid()),
            'direction' => $direction,
            'sender_id' => $sender?->id,
            'account_id' => $account->id,
            'account_type' => $account->accountType(),
            'amount' => $amount,
            'status' => ChipLoad::COMPLETED,
            'processed_by' => $processedBy->id,
            'note' => $note ? mb_substr($note, 0, 255) : null,
            'processed_at' => now(),
        ]);
    }

    /**
     * Super Admin manual credit (+) or debit (-) with mandatory reason.
     */
    public function adjust(User $actor, Wallet $wallet, int $signedAmount, string $reason, ?string $idempotencyKey = null): WalletTransaction
    {
        if (! $actor->isSuperAdmin()) {
            throw new BusinessRuleException('Only a Super Admin can make manual adjustments.', 403, 'forbidden');
        }

        if ($wallet->isSystem()) {
            throw new BusinessRuleException('System wallets cannot be adjusted manually.');
        }

        $credit = $signedAmount > 0;

        return DB::transaction(function () use ($actor, $wallet, $signedAmount, $reason, $idempotencyKey, $credit) {
            app(\App\Services\System\MaintenanceService::class)->assertTransactionsAllowed($actor, $wallet->user);
            $transaction = $this->ledger->transfer(new TransferRequest(
                type: $credit ? TransactionType::ManualAdjustment : TransactionType::PlayerDebit,
                currency: $wallet->currency,
                source: $credit ? null : $wallet,
                destination: $credit ? $wallet : null,
                amount: abs($signedAmount),
                reason: $reason,
                actor: $actor,
                idempotencyKey: $idempotencyKey ? "adjust:{$actor->id}:{$idempotencyKey}" : null,
                relatedPlayerId: $wallet->user_id,
                approvedBy: $actor->id,
            ));

            if ($transaction->wasRecentlyCreated) {
                WalletAdjustment::create([
                    'wallet_transaction_id' => $transaction->id,
                    'wallet_id' => $wallet->id,
                    'direction' => $credit ? 'credit' : 'debit',
                    'amount' => abs($signedAmount),
                    'reason' => $reason,
                    'requested_by' => $actor->id,
                    'approved_by' => $actor->id,
                ]);

                AuditLogger::log($actor, 'wallet.adjust', $wallet, null, ['amount' => $signedAmount, 'reason' => $reason]);
            }

            return $transaction;
        });
    }

    public function setFrozen(User $actor, Wallet $wallet, bool $frozen): Wallet
    {
        if (! $actor->hasAbility(Ability::FreezeAllocations)) {
            throw new BusinessRuleException('You are not allowed to freeze allocations.', 403, 'forbidden');
        }

        $wallet->forceFill([
            'is_frozen' => $frozen,
            'frozen_by' => $frozen ? $actor->id : null,
            'frozen_at' => $frozen ? now() : null,
        ])->save();

        AuditLogger::log($actor, $frozen ? 'wallet.freeze' : 'wallet.unfreeze', $wallet);

        return $wallet;
    }

    /**
     * @return array{0: TransactionType, 1: ?Wallet, 2: WalletType}
     */
    private function resolveRoute(User $actor, User $recipient, Currency $currency, int $amount): array
    {
        $targetType = $recipient->isPlayer() ? WalletType::Player : WalletType::Allocation;

        if ($actor->isSuperAdmin()) {
            if ($recipient->isSuperAdmin()) {
                throw new BusinessRuleException('Allocations to Super Admin accounts are not allowed.', 403, 'forbidden');
            }

            // Loads draw on the Super Admin's own Chips (created with issue()); never from nothing.
            return [$recipient->isPlayer() ? TransactionType::PlayerCredit : TransactionType::AdminAllocation, $this->wallets->for($actor, $currency, WalletType::Allocation), $targetType];
        }

        if ($actor->isAdministrator()) {
            if (! $actor->hasAbility(Ability::AllocatePoints)) {
                throw new BusinessRuleException('You are not allowed to allocate points.', 403, 'forbidden');
            }

            if (! $recipient->isAgent() && ! $recipient->isPlayer()) {
                throw new BusinessRuleException('Administrators may allocate only to agents and players.', 403, 'forbidden');
            }

            $this->assertAdministratorLimits($actor, $currency, $amount);

            return [TransactionType::AdminAllocation, $this->wallets->for($actor, $currency, WalletType::Allocation), $targetType];
        }

        if ($actor->isAgent()) {
            $agent = $actor->agent;

            if (! $recipient->isPlayer() || $agent === null || ! $agent->owns($recipient)) {
                throw new BusinessRuleException('Agents may allocate only to their own registered players.', 403, 'forbidden');
            }

            return [TransactionType::AgentAllocation, $this->wallets->for($actor, $currency, WalletType::Allocation), WalletType::Player];
        }

        throw new BusinessRuleException('Players cannot allocate or credit points.', 403, 'forbidden');
    }

    private function assertAdministratorLimits(User $actor, Currency $currency, int $amount): void
    {
        $limit = AdministratorLimit::query()->where('user_id', $actor->id)->where('currency', $currency->value)->first();

        if ($limit === null) {
            return;
        }

        if ($limit->max_per_transaction !== null && $amount > $limit->max_per_transaction) {
            throw new BusinessRuleException('Amount exceeds your per-transaction allocation limit.');
        }

        if ($limit->daily_limit !== null) {
            $today = WalletAllocation::query()
                ->where('allocator_id', $actor->id)
                ->where('currency', $currency->value)
                ->where('created_at', '>=', now('UTC')->startOfDay())
                ->sum('amount');

            if ($today + $amount > $limit->daily_limit) {
                throw new BusinessRuleException('Amount exceeds your daily allocation limit.');
            }
        }
    }
}
