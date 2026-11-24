<?php

namespace App\Services\Agent;

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Models\Agent;
use App\Models\AgentPayoutRequest;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Support\Facades\DB;

/**
 * Commission withdrawals (Admin Panel → Commission Withdrawal; agent_payout_requests).
 *
 * A withdrawal moves Chips from an agent's commission wallet into the agent's own
 * Chips wallet (its allocation wallet), where it can load its downline or play.
 * Nothing leaves the platform and no cash is involved.
 *
 *  - An agent (any level) requests an amount → Pending (pending requests reserve the
 *    balance, so the total requested never exceeds what is available);
 *  - staff with manage_commissions approve (the ledger moves the Chips, once, keyed
 *    by the request) or reject it; an agent never reviews its own request;
 *  - staff can also withdraw directly from an agent's row (created and approved at once).
 */
class PayoutService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    /** Withdrawals are always available (in-platform Chips only). */
    public static function enabled(): bool
    {
        return true;
    }

    /** Commission available to withdraw: the commission wallet minus pending requests. */
    public function available(Agent $agent): int
    {
        $wallet = $this->wallets->for($agent->user, Currency::CH, WalletType::Commission);
        $pending = (int) AgentPayoutRequest::query()->where('agent_id', $agent->id)->where('status', 'pending')->sum('amount');

        return max(0, (int) $wallet->balance - $pending);
    }

    public function request(Agent $agent, Currency $currency, int $amount, ?User $requestedBy = null, ?string $note = null): AgentPayoutRequest
    {
        if ($currency !== Currency::CH) {
            throw new BusinessRuleException('Commissions are withdrawn in Chips.', 422, 'invalid_currency');
        }

        return DB::transaction(function () use ($agent, $amount, $requestedBy, $note) {
            // Serialise per agent so two requests can never reserve the same balance.
            Agent::query()->whereKey($agent->id)->lockForUpdate()->first();
            app(\App\Services\System\MaintenanceService::class)->assertTransactionsAllowed($requestedBy, $agent->user);

            if ($amount <= 0 || $this->available($agent) < $amount) {
                throw new BusinessRuleException('Amount exceeds the available commission balance.', 422, 'insufficient_balance');
            }

            $request = AgentPayoutRequest::create([
                'agent_id' => $agent->id,
                'requested_by' => ($requestedBy ?? $agent->user)->id,
                'currency' => Currency::CH,
                'amount' => $amount,
                'status' => 'pending',
                'note' => $note ? mb_substr($note, 0, 255) : null,
            ]);
            AuditLogger::log($requestedBy ?? $agent->user, 'commission_withdrawal.request', $request, null, ['amount' => $amount]);

            return $request;
        });
    }

    public function approve(User $actor, AgentPayoutRequest $request): AgentPayoutRequest
    {
        $this->authorizeReview($actor, $request);

        return DB::transaction(function () use ($actor, $request) {
            $request = AgentPayoutRequest::query()->lockForUpdate()->findOrFail($request->id);
            app(\App\Services\System\MaintenanceService::class)->assertTransactionsAllowed($actor, $request->agent?->user);

            if ($request->status !== 'pending') {
                throw new BusinessRuleException('Only pending withdrawals can be approved.', 409, 'invalid_state');
            }

            $agentUser = $request->agent->user;
            $transaction = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::CommissionWithdrawal,
                currency: Currency::CH,
                source: $this->wallets->for($agentUser, Currency::CH, WalletType::Commission),
                destination: $this->wallets->for($agentUser, Currency::CH, WalletType::Allocation),
                amount: $request->amount,
                reason: "Commission withdrawal #{$request->id} into own Chips",
                actor: $actor,
                idempotencyKey: "commission-withdrawal:{$request->id}",
                relatedAgentId: $agentUser->id,
                approvedBy: $actor->id,
            ));

            $request->forceFill(['status' => 'approved', 'reviewed_by' => $actor->id, 'reviewed_at' => now(), 'wallet_transaction_id' => $transaction->id])->save();
            AuditLogger::log($actor, 'commission_withdrawal.approve', $request, null, ['reference' => $transaction->reference]);

            return $request;
        });
    }

    public function reject(User $actor, AgentPayoutRequest $request, ?string $note = null): AgentPayoutRequest
    {
        $this->authorizeReview($actor, $request);

        return DB::transaction(function () use ($actor, $request, $note) {
            $request = AgentPayoutRequest::query()->lockForUpdate()->findOrFail($request->id);

            if ($request->status !== 'pending') {
                throw new BusinessRuleException('Only pending withdrawals can be rejected.', 409, 'invalid_state');
            }

            $request->forceFill(['status' => 'rejected', 'reviewed_by' => $actor->id, 'reviewed_at' => now(), 'note' => $note ? mb_substr($note, 0, 255) : $request->note])->save();
            AuditLogger::log($actor, 'commission_withdrawal.reject', $request, null, ['note' => $note]);

            return $request;
        });
    }

    /** Staff withdraw an agent's commission directly (created and approved in one step). */
    public function withdrawFor(User $actor, Agent $agent, int $amount, ?string $note = null): AgentPayoutRequest
    {
        $this->assertReviewer($actor, $agent);

        return DB::transaction(fn () => $this->approve($actor, $this->request($agent, Currency::CH, $amount, $actor, $note)));
    }

    private function authorizeReview(User $actor, AgentPayoutRequest $request): void
    {
        $this->assertReviewer($actor, $request->agent);
    }

    private function assertReviewer(User $actor, Agent $agent): void
    {
        if ((! $actor->isSuperAdmin() && ! $actor->hasAbility(Ability::ManageCommissions)) || $agent->user_id === $actor->id) {
            throw new BusinessRuleException('You are not allowed to review this withdrawal.', 403, 'forbidden');
        }
    }
}
