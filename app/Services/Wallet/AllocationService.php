<?php

namespace App\Services\Wallet;

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Models\AdministratorLimit;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletAdjustment;
use App\Models\WalletAllocation;
use App\Models\WalletTransaction;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * Controlled point allocation down the hierarchy:
 *
 *   Super Admin  --issues-->  Administrator / Agent allocation wallet, or a player wallet
 *   Administrator --from own allocation wallet--> Agent allocation wallet or player wallet
 *   Agent        --from own allocation wallet--> wallets of the agent's OWN players only
 *
 * Players can never credit themselves. Nobody but Super Admin creates points.
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
    ): WalletTransaction {
        if ($actor->id === $recipient->id) {
            throw new BusinessRuleException('You cannot allocate points to yourself.', 403, 'forbidden');
        }

        if (! $recipient->isActive()) {
            throw new BusinessRuleException('The recipient account is suspended.');
        }

        [$type, $source, $targetType] = $this->resolveRoute($actor, $recipient, $currency, $amount);
        $destination = $this->wallets->for($recipient, $currency, $targetType);

        return DB::transaction(function () use ($actor, $recipient, $currency, $amount, $reason, $idempotencyKey, $type, $source, $destination, $targetType) {
            $transaction = $this->ledger->transfer(new TransferRequest(
                type: $type,
                currency: $currency,
                source: $source,
                destination: $destination,
                amount: $amount,
                reason: $reason,
                actor: $actor,
                idempotencyKey: $idempotencyKey ? "alloc:{$actor->id}:{$idempotencyKey}" : null,
                relatedPlayerId: $recipient->isPlayer() ? $recipient->id : null,
                relatedAgentId: $actor->isAgent() ? $actor->id : ($recipient->isAgent() ? $recipient->id : null),
                approvedBy: $actor->id,
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

                AuditLogger::log($actor, 'wallet.allocate', $transaction, null, [
                    'recipient_id' => $recipient->id,
                    'currency' => $currency->value,
                    'amount' => $amount,
                    'target' => $targetType->value,
                ]);
            }

            return $transaction;
        });
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

            return [$recipient->isPlayer() ? TransactionType::PlayerCredit : TransactionType::AdminAllocation, null, $targetType];
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
