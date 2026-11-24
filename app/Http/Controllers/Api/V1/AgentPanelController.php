<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Enums\WalletType;
use App\Http\Controllers\Api\V1\Admin\PanelController;
use App\Models\Agent;
use App\Models\AgentCommission;
use App\Models\AgentPayoutRequest;
use App\Models\AgentPlayer;
use App\Models\ChipLoad;
use App\Models\User;
use App\Services\Agent\TeamService;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Agent Panel (Agents, Master Agents and Silver Agents): the same screens as the Admin
 * Panel — Overview, Load Logs, Commission Logs, Commission Withdrawal, Agents / Players —
 * served by the same code, limited to the signed-in agent and its own downline. Agents can
 * load Chips to their own players, request Chips and request commission withdrawals; every
 * approval, ban, archive, withdrawal of Chips and rate change stays with the Administrators
 * (those routes are not registered here and the services refuse them for agents).
 */
class AgentPanelController extends PanelController
{
    // ------------------------------------------------------------------ overview

    public function overview(Request $request): JsonResponse
    {
        $me = $request->user();
        $agent = $this->agentOf($me);
        $team = $this->team();
        $wallets = app(WalletService::class);

        $levels = $team['agents'] === [] ? collect() : Agent::query()->whereIn('agents.user_id', $team['agents'])
            ->join('users', 'users.id', '=', 'agents.user_id')->where('users.status', UserStatus::Active->value)
            ->selectRaw('agents.level, COUNT(*) as n')->groupBy('agents.level')->pluck('n', 'level');
        $downline = User::query()->whereIn('id', array_merge($team['agents'], $team['players']));

        return response()->json(['data' => [
            'me' => ['id' => $me->id, 'username' => $me->username, 'name' => $me->name, 'role' => $me->role->value, 'role_label' => $agent->level->label(), 'is_super_admin' => false],
            'level' => $agent->level->value,
            'level_label' => $agent->level->label(),
            'upline' => $agent->parent?->user?->only(['id', 'username', 'name']),
            'my_chips' => Points::decimal($this->chips->chipsBalance($me)),
            'allocation_frozen' => (bool) $wallets->for($me, Currency::CH, WalletType::Allocation)->is_frozen,
            'commission' => [
                'balance' => Points::decimal((int) $wallets->for($me, Currency::CH, WalletType::Commission)->balance),
                'available' => Points::decimal($this->withdrawals->available($agent)),
            ],
            'active_agents' => [
                'total' => (int) $levels->sum(),
                'agent' => (int) ($levels['agent'] ?? 0),
                'master' => (int) ($levels['master'] ?? 0),
                'silver' => (int) ($levels['silver'] ?? 0),
            ],
            'active_players' => (clone $downline)->where('role', Role::Player->value)->where('status', UserStatus::Active->value)->count(),
            'my_players' => count($team['owned']),
            'pending_users' => (clone $downline)->where('status', UserStatus::Pending->value)->count(),
            'banned_users' => (clone $downline)->whereIn('status', [UserStatus::Banned->value, UserStatus::Suspended->value])->count(),
            'pending_chip_requests' => ChipLoad::query()->where('account_id', $me->id)->where('direction', ChipLoad::REQUEST)->where('status', ChipLoad::PENDING)->count(),
            // Kept for older clients of GET agent/panel.
            'chips' => Points::decimal($this->chips->chipsBalance($me)),
            'chip_requests' => ChipLoad::query()->where('account_id', $me->id)->where('direction', ChipLoad::REQUEST)->latest('id')->limit(10)->get()->map(fn (ChipLoad $l) => [
                'reference' => $l->reference,
                'amount' => Points::decimal($l->amount),
                'status' => $l->status,
                'note' => $l->note,
                'created_at' => $l->created_at?->toIso8601String(),
            ]),
            'links' => $this->referrals->links($me),
            'recent' => [
                'load_logs' => $this->scopeLoads(ChipLoad::query())->with(['sender', 'account', 'processor', 'transaction'])->latest('id')->limit(5)->get()->map(fn (ChipLoad $l) => $this->presentLoad($l)),
                'commission_logs' => $this->scopeCommissions(AgentCommission::query())->with(['agent.user', 'player'])->latest('id')->limit(5)->get()->map(fn (AgentCommission $c) => $this->presentCommission($c)),
                'withdrawals' => $this->scopeWithdrawals(AgentPayoutRequest::query())->with(['agent.user', 'reviewer'])->latest('id')->limit(5)->get()->map(fn (AgentPayoutRequest $r) => $this->presentWithdrawal($r)),
            ],
        ]]);
    }

    /** Load Chips to one of the agent's own players (the same Load Logs record as the Administrators'). */
    public function load(Request $request, User $user): JsonResponse
    {
        abort_unless(in_array($user->id, $this->team()['players'], true), 404);

        return parent::load($request, $user);
    }

    /** Withdraw Chips from one of the agent's own players back into the agent's Chips. */
    public function withdraw(Request $request, User $user): JsonResponse
    {
        abort_unless(in_array($user->id, $this->team()['players'], true), 404);

        return parent::withdraw($request, $user);
    }

    // ------------------------------------------------------------------ the agent's own scope

    protected function scopeLoads(Builder $query): Builder
    {
        $team = $this->team();
        $accounts = array_merge([$team['me']], $team['agents'], $team['players']);

        return $query->where(fn (Builder $q) => $q->where('chip_loads.sender_id', $team['me'])->orWhereIn('chip_loads.account_id', $accounts));
    }

    protected function scopeCommissions(Builder $query): Builder
    {
        return $query->whereIn('agent_commissions.agent_id', $this->team()['agent_rows']);
    }

    protected function scopeWithdrawals(Builder $query): Builder
    {
        return $query->whereIn('agent_payout_requests.agent_id', $this->team()['agent_rows']);
    }

    protected function scopeAccounts(Builder $query): Builder
    {
        $team = $this->team();

        return $query->whereIn('users.id', array_merge($team['agents'], $team['players']));
    }

    /** @return array<string, mixed> */
    protected function accountExtras(User $u): array
    {
        return ['can_load' => $u->isPlayer() && $u->status === UserStatus::Active && in_array($u->id, $this->team()['owned'], true)];
    }

    /** @return array<string, mixed> */
    protected function withdrawalSummary(User $me): array
    {
        $agent = $this->agentOf($me);
        $mine = AgentPayoutRequest::query()->where('agent_id', $agent->id);

        return [
            'available' => Points::decimal($this->withdrawals->available($agent)),
            'pending' => Points::decimal((int) (clone $mine)->where('status', 'pending')->sum('amount')),
            'pending_count' => (clone $mine)->where('status', 'pending')->count(),
            'withdrawn' => Points::decimal((int) (clone $mine)->whereIn('status', ['approved', 'paid'])->sum('amount')),
        ];
    }

    private function agentOf(User $user): Agent
    {
        $agent = $user->agent;
        abort_unless($user->isAgent() && $agent instanceof Agent, 403);

        return $agent;
    }

    /**
     * The signed-in agent and its downline (computed once per request).
     *
     * @return array{me: int, agents: list<int>, players: list<int>, agent_rows: list<int>, owned: list<int>}
     */
    private function team(): array
    {
        // Cached on the request itself: Laravel reuses controller instances between requests.
        $request = request();
        if ($request->attributes->has('agent_team')) {
            return $request->attributes->get('agent_team');
        }

        $me = $request->user();
        $agent = $this->agentOf($me);
        [$agents, $players] = app(TeamService::class)->downline($me);

        $team = [
            'me' => $me->id,
            'agents' => $agents,
            'players' => $players,
            'agent_rows' => array_merge([$agent->id], $agents === [] ? [] : Agent::query()->whereIn('user_id', $agents)->pluck('id')->all()),
            'owned' => AgentPlayer::query()->where('agent_id', $agent->id)->pluck('player_id')->all(),
        ];
        $request->attributes->set('agent_team', $team);

        return $team;
    }

    // ------------------------------------------------------------------ requests to the Administrator

    public function requestChips(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'regex:/^\d{1,13}(\.\d{1,2})?$/'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $load = $this->chips->request($request->user(), Points::toMinor($data['amount']), $data['note'] ?? null);

        return response()->json(['message' => 'Chips request sent for approval.', 'data' => ['reference' => $load->reference, 'status' => $load->status, 'amount' => Points::decimal($load->amount)]], 201);
    }
}
