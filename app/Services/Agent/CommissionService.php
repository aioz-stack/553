<?php

namespace App\Services\Agent;

use App\Enums\Ability;
use App\Enums\CommissionStatus;
use App\Enums\Currency;
use App\Enums\GameStatus;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Enums\AgentLevel;
use App\Models\Agent;
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
 * Agent commissions = a share of the platform fee actually collected from each
 * player in a completed, settled game, paid up the hierarchy
 * (Administrator → Incorporator → Master Agent → Player).
 *
 * Rates (basis points of the fee): each agent's own override rule, else its
 * level's default (Incorporator 50%, Master Agent 40%), else the
 * platform default. The player's direct sponsor earns its rate; each upline
 * agent earns its OVERRIDE — the difference between its rate and the highest
 * rate already paid below it (never negative):
 *
 *   player under a Master Agent: Master 40% · Incorporator 50−40 = 10%
 *
 * so the chain together never takes more than the top rate and the platform
 * keeps the rest. A player directly under the Administrator earns nobody a
 * commission. Inactive agents are skipped (their share stays with the platform).
 *
 *   commission = floor(fee_attributed_to_player × share_bps / 10000)
 *
 * The share and fee basis are snapshotted on each row; one row per (agent,
 * game, player) so retries never pay twice.
 *
 * Lifecycle: pending → approved → paid (into the agent's commission wallet);
 * pending → rejected; pending/approved/paid → reversed (paid reversals move
 * funds back). Commission balances are separate wallets (type=commission) and
 * are withdrawn into the agent's own Chips (CommissionWithdrawalService).
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

        $links = AgentPlayer::query()->with('agent.parent')->whereIn('player_id', array_keys($feeAttribution))->get();
        $created = [];

        foreach ($links as $link) {
            $fee = $feeAttribution[$link->player_id] ?? 0;

            if ($fee <= 0) {
                continue;
            }

            $paidBps = 0;

            foreach ($link->agent->chain() as $depth => $agent) {
                $rule = $this->ruleFor($agent, $session->currency);
                $rate = $rule?->rate_bps ?? 0;
                $share = max(0, $rate - $paidBps);
                $paidBps = max($paidBps, $rate);

                if ($share <= 0 || $agent->status !== 'active' || ! $agent->user?->isActive()) {
                    continue;
                }

                $amount = intdiv($fee * $share, 10000);

                if ($amount <= 0) {
                    continue;
                }

                // Unique (agent, session, player) prevents duplicates on retries.
                $created[] = AgentCommission::query()->firstOrCreate(
                    ['agent_id' => $agent->id, 'game_session_id' => $session->id, 'player_id' => $link->player_id],
                    [
                        'commission_rule_id' => $rule->id,
                        'currency' => $session->currency,
                        'fee_basis' => $fee,
                        'rate_bps' => $share,
                        'amount' => $amount,
                        'status' => CommissionStatus::Pending,
                        // direct = the player's own sponsor; override = an upline level's difference.
                        'note' => $depth === 0 ? 'direct' : 'override',
                    ],
                );
            }
        }

        return $created;
    }

    /** The rate rule for an agent: its own override, else its level default, else the platform default. */
    public function ruleFor(Agent|int $agent, Currency $currency): ?AgentCommissionRule
    {
        $agent = $agent instanceof Agent ? $agent : Agent::query()->find($agent);

        if ($agent === null) {
            return null;
        }

        $level = $agent->level?->value ?? 'agent';

        return AgentCommissionRule::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q->where('agent_id', $agent->id)
                ->orWhere(fn ($d) => $d->whereNull('agent_id')->where('level', $level))
                ->orWhere(fn ($d) => $d->whereNull('agent_id')->whereNull('level')))
            ->where(fn ($q) => $q->where('currency', $currency->value)->orWhereNull('currency'))
            ->orderByRaw('agent_id IS NULL')
            ->orderByRaw('level IS NULL')
            ->orderByRaw('currency IS NULL')
            ->latest('id')
            ->first();
    }

    /**
     * Default rate per level (basis points), as configured (or the built-in defaults).
     *
     * @return array<string, int>
     */
    public function levelRates(): array
    {
        $out = [];
        foreach (AgentLevel::cases() as $level) {
            $out[$level->value] = (int) (AgentCommissionRule::query()->whereNull('agent_id')->where('level', $level->value)->where('is_active', true)->latest('id')->value('rate_bps') ?? $level->defaultRateBps());
        }

        return $out;
    }

    /**
     * Set the default rate of each level (Super Admin / manage_commissions). Old rules are
     * deactivated, never edited, so past commissions keep the rate they were paid at.
     *
     * @param  array<string, int>  $rates  level => basis points
     */
    public function setLevelRates(User $actor, array $rates): array
    {
        if (! $actor->isSuperAdmin() && ! $actor->hasAbility(Ability::ManageCommissions)) {
            throw new BusinessRuleException('You are not allowed to change commission rates.', 403, 'forbidden');
        }

        DB::transaction(function () use ($actor, $rates) {
            foreach ($rates as $level => $bps) {
                if (AgentLevel::tryFrom($level) === null || $bps < 0 || $bps > 10000) {
                    throw new BusinessRuleException('Rates must be between 0% and 100%.', 422, 'invalid_rate');
                }
                AgentCommissionRule::query()->whereNull('agent_id')->where('level', $level)->update(['is_active' => false]);
                AgentCommissionRule::create(['agent_id' => null, 'level' => $level, 'currency' => null, 'rate_bps' => $bps, 'is_active' => true, 'created_by' => $actor->id]);
            }
            AuditLogger::log($actor, 'commission.level_rates', null, null, $rates);
        });

        return $this->levelRates();
    }
    public function approve(User $actor, AgentCommission $commission): AgentCommission
    {
        $this->authorizeReview($actor, $commission);

        return DB::transaction(function () use ($actor, $commission) {
            $commission = AgentCommission::query()->lockForUpdate()->findOrFail($commission->id);
            app(\App\Services\System\MaintenanceService::class)->assertTransactionsAllowed($actor, $commission->agent?->user);

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
            app(\App\Services\System\MaintenanceService::class)->assertTransactionsAllowed($actor, $commission->agent?->user);

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
        // Approved commissions are paid in Chips into the agent's commission wallet.
        return $currency === Currency::CH;
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
