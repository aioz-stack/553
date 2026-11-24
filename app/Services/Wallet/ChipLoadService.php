<?php

namespace App\Services\Wallet;

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientBalanceException;
use App\Models\ChipLoad;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Admin Panel Chips actions (everything is Chips; Gold never moves here):
 *
 *  - load()      — staff send Chips from their own Chips wallet to an account (AllocationService);
 *  - withdraw()  — staff take Chips back from an account into their own Chips wallet;
 *  - request()   — an agent asks for Chips (a Pending Load Logs row);
 *  - approve() / reject() a request — approval loads the Chips from the reviewer's own wallet.
 *
 * An account's Chips wallet is its player wallet (Players) or its allocation wallet
 * (Agents, Master / Silver Agents, Administrators). Every movement goes through the
 * ledger (row locks, no negative balances, idempotency keys) and is recorded in the
 * Load Logs with the staff member responsible.
 */
class ChipLoadService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
        private readonly AllocationService $allocations,
    ) {}

    public function load(User $actor, User $account, int $amount, ?string $note = null, ?string $idempotencyKey = null): ChipLoad
    {
        // Agents load only their own registered players (AllocationService enforces ownership);
        // Loader Accounts load from their employer Admin's Chips; withdrawing stays with the Admins.
        [$funder, $processor] = $this->funderFor($actor);
        $this->authorize($funder, $account, allowAgents: true);
        $this->assertAmount($amount);

        try {
            $transaction = $this->allocations->allocate($funder, $account, Currency::CH, $amount, $note ?: 'Chips loaded', $idempotencyKey, $processor);
        } catch (InsufficientBalanceException) {
            throw new BusinessRuleException('You do not have enough Chips to load this amount.', 422, 'insufficient_balance');
        }

        return ChipLoad::query()->where('wallet_transaction_id', $transaction->id)->firstOrFail();
    }

    public function withdraw(User $actor, User $account, int $amount, ?string $note = null, ?string $idempotencyKey = null): ChipLoad
    {
        // Agents withdraw only from their own registered players, back into their own Chips.
        $this->authorize($actor, $account, allowAgents: true);
        if ($actor->isAgent() && ! $actor->agent?->owns($account)) {
            throw new BusinessRuleException('Agents may withdraw Chips only from their own registered players.', 403, 'forbidden');
        }
        $this->assertAmount($amount);

        return DB::transaction(function () use ($actor, $account, $amount, $note, $idempotencyKey) {
            app(\App\Services\System\MaintenanceService::class)->assertTransactionsAllowed($actor, $account);
            try {
                $transaction = $this->ledger->transfer(new TransferRequest(
                    type: TransactionType::ChipWithdrawal,
                    currency: Currency::CH,
                    source: $this->chipsWallet($account),
                    destination: $this->wallets->for($actor, Currency::CH, WalletType::Allocation),
                    amount: $amount,
                    reason: $note ?: 'Chips withdrawn by '.$actor->username,
                    actor: $actor,
                    idempotencyKey: $idempotencyKey ? "chip-withdraw:{$actor->id}:{$idempotencyKey}" : null,
                    relatedPlayerId: $account->isPlayer() ? $account->id : null,
                    relatedAgentId: $account->isAgent() ? $account->id : null,
                    approvedBy: $actor->id,
                ));
            } catch (InsufficientBalanceException) {
                throw new BusinessRuleException("{$account->username} does not have that many Chips.", 422, 'insufficient_balance');
            }

            $load = AllocationService::logLoad(ChipLoad::WITHDRAW, $actor, $account, $amount, $transaction, $actor, $note);

            if ($load->wasRecentlyCreated) {
                AuditLogger::log($actor, 'chips.withdraw', $account, null, ['amount' => $amount, 'reference' => $load->reference]);
                if ($account->isPlayer()) {
                    $account->notify((new \App\Notifications\ChipsWithdrawn($load))->afterCommit());
                }
            }

            return $load;
        });
    }

    /** An agent asks for Chips; staff approve (load from their own wallet) or reject it. */
    public function request(User $agent, int $amount, ?string $note = null): ChipLoad
    {
        if (! $agent->isAgent() || ! $agent->isActive()) {
            throw new BusinessRuleException('Only active agents can request Chips.', 403, 'forbidden');
        }

        $this->assertAmount($amount);
        app(\App\Services\System\MaintenanceService::class)->assertTransactionsAllowed($agent);

        if (ChipLoad::query()->where('account_id', $agent->id)->where('direction', ChipLoad::REQUEST)->where('status', ChipLoad::PENDING)->count() >= 3) {
            throw new BusinessRuleException('You already have 3 Chips requests waiting for approval.', 422, 'too_many_requests');
        }

        $load = ChipLoad::create([
            'reference' => 'RQ'.strtoupper((string) Str::ulid()),
            'direction' => ChipLoad::REQUEST,
            'sender_id' => null,
            'account_id' => $agent->id,
            'account_type' => $agent->accountType(),
            'amount' => $amount,
            'status' => ChipLoad::PENDING,
            'note' => $note ? mb_substr($note, 0, 255) : null,
        ]);
        AuditLogger::log($agent, 'chips.request', $load, null, ['amount' => $amount]);

        return $load;
    }

    public function approve(User $actor, ChipLoad $load): ChipLoad
    {
        [$funder, $processor] = $this->funderFor($actor);

        return DB::transaction(function () use ($funder, $processor, $load) {
            $load = $this->lockPending($load);
            $this->authorize($funder, $load->account);
            $actor = $processor;

            try {
                $transaction = $this->allocations->allocate($funder, $load->account, Currency::CH, $load->amount, 'Chips request '.$load->reference.' approved', "request-{$load->id}", $processor);
            } catch (InsufficientBalanceException) {
                throw new BusinessRuleException('You do not have enough Chips to approve this request.', 422, 'insufficient_balance');
            }

            // The allocation wrote its own Load Logs row; this request row becomes the record of it.
            ChipLoad::query()->where('wallet_transaction_id', $transaction->id)->where('id', '!=', $load->id)->delete();
            $load->forceFill([
                'status' => ChipLoad::COMPLETED,
                'sender_id' => $funder->id,
                'processed_by' => $actor->id,
                'processed_at' => now(),
                'wallet_transaction_id' => $transaction->id,
            ])->save();
            AuditLogger::log($actor, 'chips.request_approved', $load, null, ['amount' => $load->amount]);

            return $load;
        });
    }

    public function reject(User $actor, ChipLoad $load, ?string $note = null): ChipLoad
    {
        [$funder] = $this->funderFor($actor);

        return DB::transaction(function () use ($actor, $funder, $load, $note) {
            $load = $this->lockPending($load);
            $this->authorize($funder, $load->account);
            $load->forceFill([
                'status' => ChipLoad::REJECTED,
                'processed_by' => $actor->id,
                'processed_at' => now(),
                'note' => $note ? mb_substr($note, 0, 255) : $load->note,
            ])->save();
            AuditLogger::log($actor, 'chips.request_rejected', $load, null, ['note' => $note]);

            return $load;
        });
    }

    /** The wallet an account's Chips balance lives in. */
    public function chipsWallet(User $user)
    {
        return $this->wallets->for($user, Currency::CH, $user->isPlayer() ? WalletType::Player : WalletType::Allocation);
    }

    public function chipsBalance(User $user): int
    {
        return (int) $this->chipsWallet($user)->balance;
    }

    private function lockPending(ChipLoad $load): ChipLoad
    {
        /** @var ChipLoad $load */
        $load = ChipLoad::query()->with('account')->lockForUpdate()->findOrFail($load->id);

        if ($load->status !== ChipLoad::PENDING) {
            throw new BusinessRuleException('This request has already been processed.', 409, 'invalid_state');
        }

        return $load;
    }

    /**
     * Whose Chips pay for a load, and who processes it. A Loader Account (with the Load
     * Transactions permission) works with its employer Admin's Chips and rules.
     *
     * @return array{0: User, 1: User}
     */
    private function funderFor(User $actor): array
    {
        if (! $actor->isLoader()) {
            return [$actor, $actor];
        }

        if (! $actor->hasLoaderPermission(\App\Enums\LoaderPermission::Loads)) {
            throw new BusinessRuleException('You are not allowed to process loads.', 403, 'forbidden');
        }

        $employer = $actor->employer() ?? throw new BusinessRuleException('Your employer Admin account is not active; loads are unavailable.', 409, 'no_employer');

        return [$employer, $actor];
    }

    private function authorize(User $actor, User $account, bool $allowAgents = false): void
    {
        $agentLoad = $allowAgents && $actor->isAgent() && $actor->isActive() && $account->isPlayer();

        if (! $agentLoad && ! $actor->isSuperAdmin() && ! ($actor->isAdministrator() && $actor->hasAbility(Ability::AllocatePoints))) {
            throw new BusinessRuleException('You are not allowed to move Chips.', 403, 'forbidden');
        }

        if ($account->id === $actor->id || $account->isSuperAdmin()) {
            throw new BusinessRuleException('Choose another account.', 403, 'forbidden');
        }

        if (! $account->isActive()) {
            throw new BusinessRuleException('Chips can only move for active accounts.', 409, 'account_inactive');
        }
    }

    private function assertAmount(int $amount): void
    {
        if ($amount <= 0) {
            throw new BusinessRuleException('Enter an amount greater than zero.', 422, 'invalid_amount');
        }
    }
}
