<?php

namespace App\Services\Wallet;

use App\Enums\TransactionStatus;
use App\Enums\TransactionType;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientBalanceException;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The ONLY code path that changes wallet balances.
 *
 * Guarantees:
 *  - atomic: balance updates and the ledger row commit together;
 *  - row-level locking (SELECT ... FOR UPDATE) in ascending wallet id order to avoid deadlocks;
 *  - no negative balances (checked under lock, plus UNSIGNED columns);
 *  - idempotency: the same idempotency key returns the original transaction
 *    instead of moving money twice; reusing a key with different parameters fails;
 *  - CP and VC never mix: both wallets must match the transfer currency.
 */
class LedgerService
{
    public function transfer(TransferRequest $request): WalletTransaction
    {
        if ($request->amount <= 0) {
            throw new BusinessRuleException('Amount must be greater than zero.');
        }

        if ($request->source === null && $request->destination === null) {
            throw new BusinessRuleException('A transfer needs a source or a destination wallet.');
        }

        foreach ([$request->source, $request->destination] as $wallet) {
            if ($wallet && $wallet->currency !== $request->currency) {
                throw new BusinessRuleException('Currency mismatch: CP and VC can never be combined.');
            }
        }

        if ($request->source && $request->destination && $request->source->id === $request->destination->id) {
            throw new BusinessRuleException('Source and destination wallets must differ.');
        }

        if ($request->idempotencyKey && ($existing = $this->findIdempotent($request))) {
            return $existing;
        }

        try {
            return DB::transaction(fn () => $this->apply($request));
        } catch (UniqueConstraintViolationException $e) {
            // A concurrent request with the same idempotency key won the race.
            // Locking read: always sees the winner's committed row, even inside
            // an enclosing transaction with an older snapshot.
            if ($request->idempotencyKey && ($existing = $this->findIdempotent($request, locking: true))) {
                return $existing;
            }

            throw $e;
        }
    }

    /**
     * Correct a completed transaction by moving the amount back. The original
     * row is never modified; the reversal links to it (one reversal max).
     */
    public function reverse(WalletTransaction $original, ?User $actor, string $reason): WalletTransaction
    {
        // Always work from the stored row, never from a possibly-modified model instance.
        $original = WalletTransaction::query()->with(['source', 'destination'])->findOrFail($original->id);

        if ($original->reversal_of_id !== null) {
            throw new BusinessRuleException('A reversal cannot itself be reversed.');
        }

        if ($original->reversedBy()->exists()) {
            throw new BusinessRuleException('This transaction has already been reversed.');
        }

        return $this->transfer(new TransferRequest(
            type: TransactionType::Reversal,
            currency: $original->currency,
            source: $original->destination,
            destination: $original->source,
            amount: $original->amount,
            reason: $reason,
            actor: $actor,
            idempotencyKey: 'reversal:'.$original->id,
            relatedPlayerId: $original->related_player_id,
            relatedAgentId: $original->related_agent_id,
            gameSessionId: $original->game_session_id,
            reversalOfId: $original->id,
            metadata: ['reverses' => $original->reference],
        ));
    }

    private function apply(TransferRequest $request): WalletTransaction
    {
        $ids = array_values(array_filter([$request->source?->id, $request->destination?->id]));
        sort($ids);

        /** @var Collection<int, Wallet> $locked */
        $locked = Wallet::query()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');

        $source = $request->source ? $locked[$request->source->id] : null;
        $destination = $request->destination ? $locked[$request->destination->id] : null;

        if ($source?->is_frozen && $request->type !== TransactionType::Reversal) {
            throw new BusinessRuleException('The source wallet is frozen.', 423, 'wallet_frozen');
        }

        if ($source && $source->balance < $request->amount) {
            throw new InsufficientBalanceException;
        }

        $sourceBefore = $source?->balance;
        $destinationBefore = $destination?->balance;

        if ($source) {
            DB::table('wallets')->where('id', $source->id)->update([
                'balance' => $sourceBefore - $request->amount,
                'updated_at' => now(),
            ]);
        }

        if ($destination) {
            DB::table('wallets')->where('id', $destination->id)->update([
                'balance' => $destinationBefore + $request->amount,
                'updated_at' => now(),
            ]);
        }

        $transaction = WalletTransaction::create([
            'reference' => 'TX'.strtoupper((string) Str::ulid()),
            'idempotency_key' => $request->idempotencyKey,
            'type' => $request->type,
            'currency' => $request->currency,
            'source_wallet_id' => $source?->id,
            'destination_wallet_id' => $destination?->id,
            'amount' => $request->amount,
            'source_balance_before' => $sourceBefore,
            'source_balance_after' => $source ? $sourceBefore - $request->amount : null,
            'destination_balance_before' => $destinationBefore,
            'destination_balance_after' => $destination ? $destinationBefore + $request->amount : null,
            'status' => TransactionStatus::Completed,
            'reason' => $request->reason,
            'created_by' => $request->actor?->id,
            'approved_by' => $request->approvedBy,
            'related_player_id' => $request->relatedPlayerId,
            'related_agent_id' => $request->relatedAgentId,
            'game_session_id' => $request->gameSessionId,
            'reversal_of_id' => $request->reversalOfId,
            'metadata' => $request->metadata ?: null,
        ]);

        // Keep the caller's model instances in sync with the database.
        $request->source?->setRawAttributes(array_merge($request->source->getAttributes(), ['balance' => $transaction->source_balance_after]), true);
        $request->destination?->setRawAttributes(array_merge($request->destination->getAttributes(), ['balance' => $transaction->destination_balance_after]), true);

        // Chips balances feed the panels' Team Overview: tell the owners (and, in the worker, their upline).
        if ($request->currency === \App\Enums\Currency::CH) {
            $owners = array_values(array_filter([$source?->user_id, $destination?->user_id]));
            if ($owners !== []) {
                event(new \App\Events\PanelUpdated($owners, 'wallet'));
            }
        }

        return $transaction;
    }

    private function findIdempotent(TransferRequest $request, bool $locking = false): ?WalletTransaction
    {
        $existing = WalletTransaction::query()
            ->where('idempotency_key', $request->idempotencyKey)
            ->when($locking, fn ($q) => $q->sharedLock())
            ->first();

        if ($existing === null) {
            return null;
        }

        $matches = $existing->type === $request->type
            && $existing->currency === $request->currency
            && $existing->amount === $request->amount
            && $existing->source_wallet_id === $request->source?->id
            && $existing->destination_wallet_id === $request->destination?->id;

        if (! $matches) {
            throw new BusinessRuleException('Idempotency key was already used for a different transaction.', 409, 'idempotency_conflict');
        }

        return $existing;
    }
}
