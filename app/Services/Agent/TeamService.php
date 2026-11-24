<?php

namespace App\Services\Agent;

use App\Enums\CommissionStatus;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Models\Agent;
use App\Models\AgentCommission;
use App\Models\AgentPayoutRequest;
use App\Models\AgentPlayer;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Support\Facades\DB;

/**
 * Convert Commission to Wallet and Team Overview — Administrators (incl. Super Admin), Agents,
 * Master Agents and Silver Agents only.
 *
 * Conversion moves Chips from the user's commission wallet into their own Chips wallet
 * (allocation wallet) at once: minimum 10 Chips, never more than the available commission
 * (balance less any pending withdrawal requests), serialised on the user row and keyed by
 * the request id, so a double click or a retried request converts once.
 *
 * Team Overview totals the user's downline only:
 *  - Super Admin: every agent and player on the platform;
 *  - Administrator: everyone registered under them (the permanent sponsor tree, users.sponsor_id);
 *  - Agent / Master / Silver: their sponsor tree plus their agent structure (agents below them
 *    through agents.parent_agent_id and every player linked to those agents).
 * The user themself is never counted.
 */
class TeamService
{
    /** Minimum conversion, in Chips. */
    public const MIN_CONVERSION = 10;

    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    public static function allowed(User $user): bool
    {
        return $user->isSuperAdmin() || $user->isAdministrator() || $user->isAgent();
    }

    /**
     * @return array{balance: string, available: string, pending: string, converted: string, min_conversion: int}
     */
    public function commission(User $user): array
    {
        $this->authorize($user);
        $balance = (int) $this->wallets->for($user, Currency::CH, WalletType::Commission)->balance;
        $pending = $this->pendingRequests($user);
        $commissionWallet = $this->wallets->for($user, Currency::CH, WalletType::Commission);

        return [
            'balance' => Points::decimal($balance),
            'available' => Points::decimal(max(0, $balance - $pending)),
            'pending' => Points::decimal($pending),
            'converted' => Points::decimal((int) WalletTransaction::query()
                ->where('source_wallet_id', $commissionWallet->id)
                ->whereIn('type', [TransactionType::CommissionConversion->value, TransactionType::CommissionWithdrawal->value])
                ->sum('amount')),
            'min_conversion' => self::MIN_CONVERSION,
        ];
    }

    /** Convert commission into the user's own Chips. Returns the converted amount (minor units). */
    public function convert(User $user, int $amount, string $requestId): int
    {
        $this->authorize($user);
        $key = "commission-convert:{$user->id}:{$requestId}";

        return DB::transaction(function () use ($user, $amount, $key) {
            User::query()->whereKey($user->id)->lockForUpdate()->first();

            if ($done = WalletTransaction::query()->where('idempotency_key', $key)->first()) {
                return (int) $done->amount;
            }

            if ($amount < Points::toMinor(self::MIN_CONVERSION)) {
                throw new BusinessRuleException('The minimum conversion is '.self::MIN_CONVERSION.' Chips.', 422, 'below_minimum');
            }

            $from = $this->wallets->for($user, Currency::CH, WalletType::Commission);
            $available = (int) $from->balance - $this->pendingRequests($user);

            if ($amount > $available) {
                throw new BusinessRuleException('The amount exceeds your available commission.', 422, 'insufficient_commission');
            }

            $tx = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::CommissionConversion,
                currency: Currency::CH,
                source: $from,
                destination: $this->wallets->for($user, Currency::CH, WalletType::Allocation),
                amount: $amount,
                reason: 'Commission converted to wallet',
                actor: $user,
                idempotencyKey: $key,
                relatedAgentId: $user->isAgent() ? $user->id : null,
            ));

            AuditLogger::log($user, 'commission.converted', $user, null, ['amount' => Points::decimal($amount), 'reference' => $tx->reference]);

            return $amount;
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function overview(User $user): array
    {
        $this->authorize($user);
        [$agentIds, $playerIds] = $this->downline($user);

        $sum = fn (array $ids, WalletType $type) => $ids === [] ? 0 : (int) Wallet::query()
            ->whereIn('user_id', $ids)->where('currency', Currency::CH->value)->where('type', $type->value)->sum('balance');

        $agentRows = $agentIds === [] ? collect() : Agent::query()->whereIn('user_id', $agentIds)->pluck('id');
        $earned = $agentRows->isEmpty() ? 0 : (int) AgentCommission::query()->whereIn('agent_id', $agentRows)
            ->whereNotIn('status', [CommissionStatus::Rejected->value, CommissionStatus::Reversed->value])->sum('amount');

        return [
            'total_player_wallets' => Points::decimal($sum($playerIds, WalletType::Player)),
            'total_agent_wallets' => Points::decimal($sum($agentIds, WalletType::Allocation)),
            'agents_commission' => Points::decimal($earned),
            // Unconverted commission still sitting in the team's agents' commission wallets.
            'agents_commission_balance' => Points::decimal($sum($agentIds, WalletType::Commission)),
            'players' => count($playerIds),
            'agents' => count($agentIds),
            'scope' => $user->isSuperAdmin() ? 'platform' : 'downline',
        ];
    }

    /**
     * The user's downline, split into agent and player user ids (the user excluded).
     *
     * @return array{0: list<int>, 1: list<int>}
     */
    public function downline(User $user): array
    {
        if ($user->isSuperAdmin()) {
            return [
                User::query()->where('role', Role::Agent->value)->pluck('id')->all(),
                User::query()->where('role', Role::Player->value)->pluck('id')->all(),
            ];
        }

        // The permanent sponsor tree.
        $ids = [];
        $frontier = [$user->id];
        while ($frontier !== []) {
            $next = User::query()->whereIn('sponsor_id', $frontier)->whereNotIn('id', array_merge($ids, [$user->id]))->pluck('id')->all();
            $ids = array_merge($ids, $next);
            $frontier = $next;
        }

        // Agents: also the agent structure (sub-agents and every player linked to them).
        if ($user->isAgent() && $user->agent) {
            $agentIds = [$user->agent->id];
            $frontier = [$user->agent->id];
            while ($frontier !== []) {
                $next = Agent::query()->whereIn('parent_agent_id', $frontier)->whereNotIn('id', $agentIds)->pluck('id')->all();
                $agentIds = array_merge($agentIds, $next);
                $frontier = $next;
            }
            $ids = array_merge(
                $ids,
                Agent::query()->whereIn('id', $agentIds)->where('user_id', '!=', $user->id)->pluck('user_id')->all(),
                AgentPlayer::query()->whereIn('agent_id', $agentIds)->pluck('player_id')->all(),
            );
        }

        $ids = array_values(array_unique(array_diff($ids, [$user->id])));
        $roles = User::query()->whereIn('id', $ids)->pluck('role', 'id');

        $agents = [];
        $players = [];
        foreach ($roles as $id => $role) {
            $value = $role instanceof Role ? $role : Role::from($role);
            if ($value === Role::Agent) {
                $agents[] = (int) $id;
            } elseif ($value === Role::Player) {
                $players[] = (int) $id;
            }
        }

        return [$agents, $players];
    }

    private function pendingRequests(User $user): int
    {
        return $user->agent ? (int) AgentPayoutRequest::query()->where('agent_id', $user->agent->id)->where('status', 'pending')->sum('amount') : 0;
    }

    private function authorize(User $user): void
    {
        if (! self::allowed($user)) {
            throw new BusinessRuleException('Only administrators and agents can use this feature.', 403, 'forbidden');
        }
    }
}
