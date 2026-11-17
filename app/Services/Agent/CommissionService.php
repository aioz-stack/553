<?php

namespace App\Services\Agent;

use App\Enums\Ability;
use App\Enums\CommissionStatus;
use App\Enums\Currency;
use App\Enums\GameStatus;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Models\AgentCommission;
use App\Models\AgentCommissionRule;
use App\Models\AgentPlayer;
use App\Models\GameSession;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Support\Facades\DB;

/**
 * Agent commissions = percentage of the platform fee actually collected
 * from each of the agent's players in a completed, settled game.
 *
 *   commission = floor(fee_attributed_to_player × rate_bps / 10000)
 *
 * Rate resolution: the agent's own active rule for the currency, else the
 * agent's currency-agnostic rule, else the platform default rule (agent_id
 * null). The rate and fee basis are snapshotted on the commission row.
 *
 * Lifecycle: pending → approved → paid; pending → rejected;
 * pending/approved/paid → reversed (paid reversals move funds back).
 * Commission balances are separate wallets (type=commission), never the
 * agent's distributable allocation wallet.
 */
class CommissionService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    /**
     * @param  array<int, int>  $feeAttribution  playerId => fee share (minor units)
     * @return list<AgentCommission>
     */
    public function generateForSession(GameSession $session, array $feeAttribution): array
    {
        if ($session->status === GameStatus::Cancelled) {
            return [];
        }

        $links = AgentPlayer::query()->with('agent')->whereIn('player_id', array_keys($feeAttribution))->get();
        $created = [];

        foreach ($links as $link) {
            $fee = $feeAttribution[$link->player_id] ?? 0;
            $rule = $this->ruleFor($link->agent_id, $session->currency);

            if ($fee <= 0 || $rule === null || $link->agent->status !== 'active') {
                continue;
            }

            $amount = intdiv($fee * $rule->rate_bps, 10000);

            if ($amount <= 0) {
                continue;
            }

            // Unique (agent, session, player) prevents duplicates on retries.
            $created[] = AgentCommission::query()->firstOrCreate(
                ['agent_id' => $link->agent_id, 'game_session_id' => $session->id, 'player_id' => $link->player_id],
                [
                    'commission_rule_id' => $rule->id,
                    'currency' => $session->currency,
                    'fee_basis' => $fee,
                    'rate_bps' => $rule->rate_bps,
                    'amount' => $amount,
                    'status' => CommissionStatus::Pending,
                ],
            );
        }

        return $created;
    }

    public function ruleFor(int $agentId, Currency $currency): ?AgentCommissionRule
    {
        return AgentCommissionRule::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q->where('agent_id', $agentId)->orWhereNull('agent_id'))
            ->where(fn ($q) => $q->where('currency', $currency->value)->orWhereNull('currency'))
            ->orderByRaw('agent_id IS NULL')
            ->orderByRaw('currency IS NULL')
            ->latest('id')
            ->first();
    }

    public function approve(User $actor, AgentCommission $commission): AgentCommission
    {
        $this->authorizeReview($actor, $commission);

        return DB::transaction(function () use ($actor, $commission) {
            $commission = AgentCommission::query()->lockForUpdate()->findOrFail($commission->id);

            if ($commission->status !== CommissionStatus::Pending) {
                throw new BusinessRuleException('Only pending commissions can be approved.', 409, 'invalid_state');
            }

            $commission->forceFill(['status' => CommissionStatus::Approved, 'reviewed_by' => $actor->id, 'reviewed_at' => now()])->save();

            if ($this->payoutsEnabled($commission->currency)) {
                $this->pay($actor, $commission);
            }

            AuditLogger::log($actor, 'commission.approve', $commission);

            return $commission->fresh();
        });
    }

    public function reject(User $actor, AgentCommission $commission, ?string $note = null): AgentCommission
    {
        $this->authorizeReview($actor, $commission);

        return DB::transaction(function () use ($actor, $commission, $note) {
            $commission = AgentCommission::query()->lockForUpdate()->findOrFail($commission->id);

            if ($commission->status !== CommissionStatus::Pending) {
                throw new BusinessRuleException('Only pending commissions can be rejected.', 409, 'invalid_state');
            }

            $commission->forceFill(['status' => CommissionStatus::Rejected, 'reviewed_by' => $actor->id, 'reviewed_at' => now(), 'note' => $note])->save();
            AuditLogger::log($actor, 'commission.reject', $commission, null, ['note' => $note]);

            return $commission;
        });
    }

    public function reverse(User $actor, AgentCommission $commission, string $note): AgentCommission
    {
        $this->authorizeReview($actor, $commission);

        return DB::transaction(function () use ($actor, $commission, $note) {
            $commission = AgentCommission::query()->lockForUpdate()->findOrFail($commission->id);

            if (in_array($commission->status, [CommissionStatus::Reversed, CommissionStatus::Rejected], true)) {
                throw new BusinessRuleException('This commission can no longer be reversed.', 409, 'invalid_state');
            }

            $reversalId = null;

            if ($commission->status === CommissionStatus::Paid && $commission->payment_transaction_id) {
                $payment = WalletTransaction::query()->findOrFail($commission->payment_transaction_id);
                $reversalId = $this->ledger->reverse($payment, $actor, 'Commission reversal: '.$note)->id;
            }

            $commission->forceFill([
                'status' => CommissionStatus::Reversed,
                'reversal_transaction_id' => $reversalId,
                'reviewed_by' => $actor->id,
                'reviewed_at' => now(),
                'note' => $note,
            ])->save();

            AuditLogger::log($actor, 'commission.reverse', $commission, null, ['note' => $note]);

            return $commission;
        });
    }

    /**
     * Reverse every non-final commission of a session (e.g. game voided).
     */
    public function reverseForSession(User $actor, GameSession $session, string $note): void
    {
        AgentCommission::query()->where('game_session_id', $session->id)
            ->whereIn('status', [CommissionStatus::Pending->value, CommissionStatus::Approved->value, CommissionStatus::Paid->value])
            ->get()
            ->each(fn (AgentCommission $c) => $this->reverse($actor, $c, $note));
    }

    public function payoutsEnabled(Currency $currency): bool
    {
        return $currency === Currency::VC || (bool) config('pusoy.features.cp_commission_payouts');
    }

    private function pay(User $actor, AgentCommission $commission): void
    {
        $agentUser = $commission->agent->user;

        $transaction = $this->ledger->transfer(new TransferRequest(
            type: TransactionType::CommissionPayment,
            currency: $commission->currency,
            source: $this->wallets->platform($commission->currency),
            destination: $this->wallets->for($agentUser, $commission->currency, WalletType::Commission),
            amount: $commission->amount,
            reason: "Agent commission for game #{$commission->game_session_id}",
            actor: $actor,
            idempotencyKey: "commission:{$commission->id}",
            relatedPlayerId: $commission->player_id,
            relatedAgentId: $agentUser->id,
            gameSessionId: $commission->game_session_id,
            approvedBy: $actor->id,
        ));

        $commission->forceFill(['status' => CommissionStatus::Paid, 'payment_transaction_id' => $transaction->id])->save();
    }

    private function authorizeReview(User $actor, AgentCommission $commission): void
    {
        if (! $actor->hasAbility(Ability::ManageCommissions)) {
            throw new BusinessRuleException('You are not allowed to review commissions.', 403, 'forbidden');
        }

        if ($commission->agent->user_id === $actor->id) {
            throw new BusinessRuleException('You cannot review your own commission.', 403, 'forbidden');
        }
    }
}
