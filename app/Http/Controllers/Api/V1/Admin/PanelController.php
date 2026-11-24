<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AgentLevel;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Agent;
use App\Models\AgentCommission;
use App\Models\AgentCommissionRule;
use App\Models\AgentPayoutRequest;
use App\Models\ChipLoad;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\Agent\CommissionService;
use App\Services\Agent\PayoutService;
use App\Services\Audit\AuditLogger;
use App\Services\Users\AccountStatusService;
use App\Services\Users\ReferralService;
use App\Services\Wallet\AllocationService;
use App\Services\Wallet\ChipLoadService;
use App\Support\Points;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * The Admin Panel (Super Admin and Administrators): dashboard, Load Logs, Commission
 * Logs, Commission Withdrawal, Agents / Players (Agents, Active Players, Pending Users,
 * Ban Users) and Archive. Every number comes from the database; every action goes
 * through a service that validates it, locks rows, moves Chips through the ledger
 * (never negative, idempotent) and writes the audit log.
 */
class PanelController extends Controller
{
    public function __construct(
        protected readonly ReferralService $referrals,
        protected readonly ChipLoadService $chips,
        protected readonly PayoutService $withdrawals,
        protected readonly CommissionService $commissions,
        protected readonly AccountStatusService $statuses,
    ) {}

    // ------------------------------------------------------------------ overview

    public function overview(Request $request): JsonResponse
    {
        $me = $request->user();
        $agents = User::query()->where('users.role', Role::Agent->value)->where('users.status', UserStatus::Active->value)
            ->join('agents', 'agents.user_id', '=', 'users.id')
            ->selectRaw('agents.level, COUNT(*) as n')->groupBy('agents.level')->pluck('n', 'level');

        return response()->json(['data' => [
            'me' => ['id' => $me->id, 'username' => $me->username, 'name' => $me->name, 'role' => $me->role->value, 'role_label' => $me->role->label(), 'is_super_admin' => $me->isSuperAdmin()],
            'my_chips' => Points::decimal($this->chips->chipsBalance($me)),
            'active_agents' => [
                'total' => (int) $agents->sum(),
                'agent' => (int) ($agents['agent'] ?? 0),
                'master' => (int) ($agents['master'] ?? 0),
                'silver' => (int) ($agents['silver'] ?? 0),
            ],
            'active_players' => User::query()->where('role', Role::Player->value)->where('status', UserStatus::Active->value)->count(),
            'pending_users' => User::query()->where('status', UserStatus::Pending->value)->count(),
            'banned_users' => User::query()->whereIn('status', [UserStatus::Banned->value, UserStatus::Suspended->value])->count(),
            'links' => $this->referrals->links($me),
            'recent' => [
                'load_logs' => ChipLoad::query()->with(['sender', 'account', 'processor', 'transaction'])->latest('id')->limit(5)->get()->map(fn (ChipLoad $l) => $this->presentLoad($l)),
                'commission_logs' => AgentCommission::query()->with(['agent.user', 'player'])->latest('id')->limit(5)->get()->map(fn (AgentCommission $c) => $this->presentCommission($c)),
                'withdrawals' => AgentPayoutRequest::query()->with(['agent.user', 'reviewer'])->latest('id')->limit(5)->get()->map(fn (AgentPayoutRequest $r) => $this->presentWithdrawal($r)),
            ],
        ]]);
    }

    /** Super Admin creates new Chips into their own wallet. */
    public function issue(Request $request, AllocationService $allocations): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'regex:/^\d{1,13}(\.\d{1,2})?$/'],
            'note' => ['nullable', 'string', 'max:255'],
            'idempotency_key' => ['nullable', 'string', 'max:64'],
        ]);
        $allocations->issue($request->user(), $this->minor($data['amount']), $data['note'] ?? null, $data['idempotency_key'] ?? null);

        return response()->json(['message' => 'Chips issued.', 'data' => ['my_chips' => Points::decimal($this->chips->chipsBalance($request->user()))]], 201);
    }

    // ------------------------------------------------------------------ load logs

    public function loadLogs(Request $request): JsonResponse
    {
        $request->validate([
            'q' => ['nullable', 'string', 'max:64'],
            'status' => ['nullable', 'in:completed,pending,rejected'],
            'direction' => ['nullable', 'in:load,withdraw,request'],
            'account_type' => ['nullable', 'in:player,agent,master,silver,admin'],
        ]);

        $page = $this->scopeLoads(ChipLoad::query())->with(['sender', 'account', 'processor', 'transaction'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('direction'), fn ($q) => $q->where('direction', $request->input('direction')))
            ->when($request->filled('account_type'), fn ($q) => $q->where('account_type', $request->input('account_type')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = '%'.$request->input('q').'%';
                $q->where(fn ($w) => $w->where('reference', 'like', $term)
                    ->orWhereHas('account', fn ($u) => $u->where('username', 'like', $term)->orWhere('name', 'like', $term))
                    ->orWhereHas('sender', fn ($u) => $u->where('username', 'like', $term)));
            })
            ->latest('id')->paginate($this->perPage($request));

        $counts = $this->scopeLoads(ChipLoad::query())->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');

        return $this->paged($page, fn (ChipLoad $l) => $this->presentLoad($l), ['counts' => [
            'completed' => (int) ($counts['completed'] ?? 0), 'pending' => (int) ($counts['pending'] ?? 0), 'rejected' => (int) ($counts['rejected'] ?? 0),
        ]]);
    }

    public function loadLog(ChipLoad $chipLoad): JsonResponse
    {
        abort_unless($this->scopeLoads(ChipLoad::query())->whereKey($chipLoad->id)->exists(), 404);
        $chipLoad->load(['sender', 'account', 'processor', 'transaction']);
        $tx = $chipLoad->transaction;

        return response()->json(['data' => $this->presentLoad($chipLoad) + [
            'ledger' => $tx ? [
                'reference' => $tx->reference,
                'type' => $tx->type->value,
                'source_balance_before' => $tx->source_balance_before !== null ? Points::decimal((int) $tx->source_balance_before) : null,
                'source_balance_after' => $tx->source_balance_after !== null ? Points::decimal((int) $tx->source_balance_after) : null,
                'destination_balance_before' => $tx->destination_balance_before !== null ? Points::decimal((int) $tx->destination_balance_before) : null,
                'destination_balance_after' => $tx->destination_balance_after !== null ? Points::decimal((int) $tx->destination_balance_after) : null,
                'reason' => $tx->reason,
            ] : null,
        ]]);
    }

    public function approveLoad(Request $request, ChipLoad $chipLoad): JsonResponse
    {
        return response()->json(['message' => 'Chips request approved.', 'data' => $this->presentLoad($this->chips->approve($request->user(), $chipLoad)->load(['sender', 'account', 'processor', 'transaction']))]);
    }

    public function rejectLoad(Request $request, ChipLoad $chipLoad): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:255']]);

        return response()->json(['message' => 'Chips request rejected.', 'data' => $this->presentLoad($this->chips->reject($request->user(), $chipLoad, $data['note'] ?? null)->load(['sender', 'account', 'processor', 'transaction']))]);
    }

    // ------------------------------------------------------------------ commission logs

    public function commissionLogs(Request $request): JsonResponse
    {
        $request->validate([
            'q' => ['nullable', 'string', 'max:64'],
            'status' => ['nullable', 'in:pending,approved,paid,rejected,reversed'],
            'level' => ['nullable', 'in:agent,master,silver'],
        ]);

        $base = $this->scopeCommissions(AgentCommission::query())
            ->when($request->filled('status'), fn ($q) => $q->where('agent_commissions.status', $request->input('status')))
            ->when($request->filled('level'), fn ($q) => $q->whereHas('agent', fn ($a) => $a->where('level', $request->input('level'))))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = '%'.$request->input('q').'%';
                $q->where(fn ($w) => $w->whereHas('agent.user', fn ($u) => $u->where('username', 'like', $term))
                    ->orWhereHas('player', fn ($u) => $u->where('username', 'like', $term))
                    ->orWhere('agent_commissions.game_session_id', ltrim((string) $request->input('q'), '#')));
            });

        $breakdown = (clone $base)->join('agents', 'agents.id', '=', 'agent_commissions.agent_id')
            ->selectRaw('agents.level, COUNT(*) as n, SUM(agent_commissions.amount) as total')->groupBy('agents.level')->get()
            ->mapWithKeys(fn ($r) => [$r->level => ['count' => (int) $r->n, 'total' => Points::decimal((int) $r->total)]]);

        $page = (clone $base)->with(['agent.user', 'player'])->latest('agent_commissions.id')->paginate($this->perPage($request));

        return $this->paged($page, fn (AgentCommission $c) => $this->presentCommission($c), [
            'breakdown' => collect(AgentLevel::cases())->mapWithKeys(fn (AgentLevel $l) => [$l->value => $breakdown[$l->value] ?? ['count' => 0, 'total' => '0.00']]),
            'rates' => array_map(fn (int $bps) => $bps / 100, $this->commissions->levelRates()),
        ]);
    }

    /** Default commission rate per level (percent of the platform fee). */
    public function setRates(Request $request): JsonResponse
    {
        $data = $request->validate([
            'agent' => ['required', 'numeric', 'min:0', 'max:100'],
            'master' => ['required', 'numeric', 'min:0', 'max:100'],
            'silver' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);
        $rates = $this->commissions->setLevelRates($request->user(), array_map(fn ($p) => (int) round($p * 100), $data));

        return response()->json(['message' => 'Commission rates saved.', 'data' => array_map(fn (int $bps) => $bps / 100, $rates)]);
    }

    /** One account's own rate (overrides its level default); null removes the override. */
    public function setAccountRate(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin() || $request->user()->can('manage_commissions'), 403);
        $agent = $user->agent ?? throw new BusinessRuleException('Only agent accounts have commission rates.', 422);
        $data = $request->validate(['rate' => ['nullable', 'numeric', 'min:0', 'max:100']]);

        AgentCommissionRule::query()->where('agent_id', $agent->id)->update(['is_active' => false]);
        if ($data['rate'] !== null) {
            AgentCommissionRule::create(['agent_id' => $agent->id, 'currency' => null, 'rate_bps' => (int) round($data['rate'] * 100), 'is_active' => true, 'created_by' => $request->user()->id]);
        }
        AuditLogger::log($request->user(), 'commission.account_rate', $user, null, ['rate' => $data['rate']]);

        return response()->json(['message' => 'Commission rate saved.', 'data' => $this->presentAccount($user->fresh(['agent', 'sponsor']))]);
    }

    // ------------------------------------------------------------------ commission withdrawals

    public function withdrawals(Request $request): JsonResponse
    {
        $request->validate(['status' => ['nullable', 'in:pending,approved,rejected'], 'q' => ['nullable', 'string', 'max:64']]);

        $page = $this->scopeWithdrawals(AgentPayoutRequest::query())->with(['agent.user', 'reviewer'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('q'), fn ($q) => $q->whereHas('agent.user', fn ($u) => $u->where('username', 'like', '%'.$request->input('q').'%')))
            ->latest('id')->paginate($this->perPage($request));

        return $this->paged($page, fn (AgentPayoutRequest $r) => $this->presentWithdrawal($r), ['summary' => $this->withdrawalSummary($request->user())]);
    }

    /** @return array<string, mixed> */
    protected function withdrawalSummary(User $me): array
    {
        $commissionWallets = (int) Wallet::query()->where('currency', Currency::CH->value)->where('type', WalletType::Commission->value)->sum('balance');
        $pending = (int) AgentPayoutRequest::query()->where('status', 'pending')->sum('amount');

        return [
            'available' => Points::decimal(max(0, $commissionWallets - $pending)),
            'pending' => Points::decimal($pending),
            'pending_count' => AgentPayoutRequest::query()->where('status', 'pending')->count(),
            'withdrawn' => Points::decimal((int) AgentPayoutRequest::query()->where('status', 'approved')->sum('amount')),
        ];
    }

    public function approveWithdrawal(Request $request, AgentPayoutRequest $payout): JsonResponse
    {
        return response()->json(['message' => 'Withdrawal approved.', 'data' => $this->presentWithdrawal($this->withdrawals->approve($request->user(), $payout)->load(['agent.user', 'reviewer']))]);
    }

    public function rejectWithdrawal(Request $request, AgentPayoutRequest $payout): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:255']]);

        return response()->json(['message' => 'Withdrawal rejected.', 'data' => $this->presentWithdrawal($this->withdrawals->reject($request->user(), $payout, $data['note'] ?? null)->load(['agent.user', 'reviewer']))]);
    }

    // ------------------------------------------------------------------ accounts

    /** kind: agents | players | pending | banned | archived. */
    public function accounts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', 'in:agents,players,pending,banned,archived'],
            'q' => ['nullable', 'string', 'max:64'],
            'level' => ['nullable', 'in:agent,master,silver'],
            'type' => ['nullable', 'in:player,agent'],
        ]);

        $query = $this->scopeAccounts(User::query())->with(['agent', 'sponsor.agent'])->whereIn('role', [Role::Agent->value, Role::Player->value]);

        match ($data['kind']) {
            'agents' => $query->where('role', Role::Agent->value)->whereIn('status', [UserStatus::Active->value, UserStatus::Suspended->value, UserStatus::Banned->value]),
            'players' => $query->where('role', Role::Player->value)->where('status', UserStatus::Active->value),
            'pending' => $query->where('status', UserStatus::Pending->value),
            'banned' => $query->whereIn('status', [UserStatus::Banned->value, UserStatus::Suspended->value]),
            'archived' => $query->where('status', UserStatus::Archived->value),
        };

        $query->when($request->filled('level'), fn (Builder $q) => $q->whereHas('agent', fn ($a) => $a->where('level', $data['level'])))
            ->when($request->filled('type'), fn (Builder $q) => $q->where('role', $data['type'] === 'agent' ? Role::Agent->value : Role::Player->value))
            ->when($request->filled('q'), function (Builder $q) use ($data) {
                $term = '%'.$data['q'].'%';
                $q->where(fn ($w) => $w->where('username', 'like', $term)->orWhere('name', 'like', $term)->orWhere('email', 'like', $term)->orWhere('users.id', ltrim($data['q'], '#')));
            });

        $page = $query->latest('users.id')->paginate($this->perPage($request));
        $balances = $this->balancesFor(collect($page->items()));

        return $this->paged($page, fn (User $u) => $this->presentAccount($u, $balances));
    }

    /** One account with its recent transactions (Archive details, account drawer). */
    public function account(User $user): JsonResponse
    {
        abort_unless($this->scopeAccounts(User::query())->whereKey($user->id)->exists(), 404);
        $user->load(['agent', 'sponsor.agent']);
        $walletIds = $user->wallets()->pluck('id')->all();

        return response()->json(['data' => $this->presentAccount($user) + [
            'email' => $user->email,
            'links' => $user->isPlayer() ? null : $this->referrals->links($user),
            'downline' => $user->agent ? [
                'agents' => Agent::query()->where('parent_agent_id', $user->agent->id)->count(),
                'players' => $user->agent->players()->count(),
            ] : null,
            'transactions' => WalletTransaction::query()->forWallets($walletIds)->latest('id')->limit(25)->get()->map(fn (WalletTransaction $t) => [
                'reference' => $t->reference,
                'type' => $t->type->value,
                'currency' => $t->currency->value,
                'amount' => Points::decimal((int) $t->amount),
                'direction' => in_array($t->destination_wallet_id, $walletIds, true) ? 'in' : 'out',
                'reason' => $t->reason,
                'created_at' => $t->created_at?->toIso8601String(),
            ]),
            'commissions_total' => Points::decimal((int) ($user->agent ? AgentCommission::query()->where('agent_id', $user->agent->id)->sum('amount') : 0)),
        ]]);
    }

    public function load(Request $request, User $user): JsonResponse
    {
        $data = $this->amountRequest($request);
        $load = $this->chips->load($request->user(), $user, $this->minor($data['amount']), $data['note'] ?? null, $data['idempotency_key'] ?? null);

        return response()->json(['message' => 'Chips loaded.', 'data' => $this->presentLoad($load->load(['sender', 'account', 'processor', 'transaction']))], 201);
    }

    public function withdraw(Request $request, User $user): JsonResponse
    {
        $data = $this->amountRequest($request);
        $load = $this->chips->withdraw($request->user(), $user, $this->minor($data['amount']), $data['note'] ?? null, $data['idempotency_key'] ?? null);

        return response()->json(['message' => 'Chips withdrawn.', 'data' => $this->presentLoad($load->load(['sender', 'account', 'processor', 'transaction']))], 201);
    }

    public function withdrawCommission(Request $request, User $user): JsonResponse
    {
        $data = $this->amountRequest($request);
        $agent = $user->agent ?? throw new BusinessRuleException('Only agent accounts have commissions.', 422, 'not_agent');
        $payout = $this->withdrawals->withdrawFor($request->user(), $agent, $this->minor($data['amount']), $data['note'] ?? null);

        return response()->json(['message' => 'Commission withdrawn into the agent\'s Chips.', 'data' => $this->presentWithdrawal($payout->load(['agent.user', 'reviewer']))], 201);
    }

    public function approve(Request $request, User $user): JsonResponse
    {
        return response()->json(['message' => 'Account approved.', 'data' => $this->presentAccount($this->referrals->approve($request->user(), $user))]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->referrals->deletePending($request->user(), $user);

        return response()->json(['message' => 'Registration deleted.']);
    }

    public function setStatus(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:ban,suspend,reactivate,archive,restore'],
            'reason' => ['required_if:action,ban,suspend', 'nullable', 'string', 'max:255'],
        ]);
        $actor = $request->user();
        $reason = $data['reason'] ?? null;

        $user = match ($data['action']) {
            'ban' => $this->statuses->block($actor, $user, UserStatus::Banned, (string) $reason),
            'suspend' => $this->statuses->block($actor, $user, UserStatus::Suspended, (string) $reason),
            'reactivate' => $this->statuses->reactivate($actor, $user, $reason),
            'archive' => $this->statuses->archive($actor, $user, $reason),
            'restore' => $this->statuses->restore($actor, $user, $reason),
        };

        return response()->json(['message' => 'Account updated.', 'data' => $this->presentAccount($user->load(['agent', 'sponsor.agent']))]);
    }

    // ------------------------------------------------------------------ scope (Administrators see everything)

    /**
     * Every list and detail goes through these, so a subclass (the agents' panel) can limit
     * the same screens to its own downline without a second copy of the queries.
     *
     * @template T of Builder
     *
     * @param  T  $query
     * @return T
     */
    protected function scopeLoads(Builder $query): Builder
    {
        return $query;
    }

    protected function scopeCommissions(Builder $query): Builder
    {
        return $query;
    }

    protected function scopeWithdrawals(Builder $query): Builder
    {
        return $query;
    }

    protected function scopeAccounts(Builder $query): Builder
    {
        return $query;
    }

    /** @return array<string, mixed> */
    protected function accountExtras(User $u): array
    {
        return [];
    }

    // ------------------------------------------------------------------ presentation

    /** @return array<string, mixed> */
    protected function presentLoad(ChipLoad $l): array
    {
        $signed = $l->direction === ChipLoad::WITHDRAW ? -$l->amount : $l->amount;

        return [
            'id' => $l->id,
            'reference' => $l->reference,
            'direction' => $l->direction,
            'transaction' => match ($l->direction) {
                ChipLoad::WITHDRAW => 'Withdraw Chips',
                ChipLoad::REQUEST => 'Chips Request',
                default => $l->sender_id === null ? 'Issue Chips' : 'Load Chips',
            },
            'sender' => $l->sender ? $this->who($l->sender) : null,
            'account' => $l->account ? $this->who($l->account) : null,
            'account_type' => $l->account_type,
            'account_type_label' => self::typeLabel($l->account_type),
            'amount' => Points::decimal($l->amount),
            'signed_amount' => Points::decimal($signed),
            'status' => $l->status,
            'processed_by' => $l->processor ? $this->who($l->processor) : null,
            'note' => $l->note,
            'ledger_reference' => $l->transaction?->reference,
            'created_at' => $l->created_at?->toIso8601String(),
            'processed_at' => $l->processed_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    protected function presentCommission(AgentCommission $c): array
    {
        $agentUser = $c->agent?->user;

        return [
            'id' => $c->id,
            'reference' => 'COM-'.str_pad((string) $c->id, 6, '0', STR_PAD_LEFT),
            'recipient' => $agentUser ? $this->who($agentUser) : null,
            'account_type' => $c->agent?->level?->value,
            'account_type_label' => $c->agent?->level?->label(),
            'source' => [
                'player' => $c->player ? $this->who($c->player) : null,
                'game_session_id' => $c->game_session_id,
                'kind' => $c->note === 'override' ? 'override' : 'direct',
            ],
            'fee_basis' => Points::decimal((int) $c->fee_basis),
            'rate' => $c->rate_bps / 100,
            'amount' => Points::decimal((int) $c->amount),
            'status' => $c->status->value,
            'created_at' => $c->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    protected function presentWithdrawal(AgentPayoutRequest $r): array
    {
        $agentUser = $r->agent?->user;

        return [
            'id' => $r->id,
            'reference' => 'WD-'.str_pad((string) $r->id, 6, '0', STR_PAD_LEFT),
            'agent' => $agentUser ? $this->who($agentUser) : null,
            'account_type' => $r->agent?->level?->value,
            'account_type_label' => $r->agent?->level?->label(),
            'amount' => Points::decimal((int) $r->amount),
            'status' => $r->status === 'paid' ? 'approved' : $r->status,
            'note' => $r->note,
            'reviewed_by' => $r->reviewer ? $this->who($r->reviewer) : null,
            'created_at' => $r->created_at?->toIso8601String(),
            'reviewed_at' => $r->reviewed_at?->toIso8601String(),
        ];
    }

    /**
     * @param  array<int, array{chips: int, commission: int}>|null  $balances
     * @return array<string, mixed>
     */
    protected function presentAccount(User $u, ?array $balances = null): array
    {
        $balances ??= $this->balancesFor(collect([$u]));
        $sponsor = $u->sponsor;

        return [
            'id' => $u->id,
            'account_id' => ($u->isPlayer() ? 'PL-' : 'AG-').str_pad((string) $u->id, 6, '0', STR_PAD_LEFT),
            'username' => $u->username,
            'name' => $u->name,
            'account_type' => $u->status === UserStatus::Pending ? ($u->registered_as ?? ($u->isAgent() ? 'agent' : 'player')) : $u->accountType(),
            'account_type_label' => $u->status === UserStatus::Pending ? ($u->isAgent() ? 'Agent registration' : 'Player') : $u->accountTypeLabel(),
            'requested_level' => $u->status === UserStatus::Pending && $u->isAgent() ? ($sponsor ? $this->referrals->recruitLevel($sponsor)?->label() : AgentLevel::Agent->label()) : null,
            'sponsor' => $sponsor ? $this->who($sponsor) : null,
            'chips' => Points::decimal($balances[$u->id]['chips'] ?? 0),
            'commission' => $u->isAgent() ? Points::decimal($balances[$u->id]['commission'] ?? 0) : null,
            'commission_rate' => $u->agent ? (($rule = AgentCommissionRule::query()->where('agent_id', $u->agent->id)->where('is_active', true)->latest('id')->first()) ? $rule->rate_bps / 100 : null) : null,
            'status' => $u->status->value,
            'status_reason' => $u->status_reason,
            'status_changed_at' => $u->status_changed_at?->toIso8601String(),
            'registered_at' => $u->created_at?->toIso8601String(),
            'approved_at' => $u->approved_at?->toIso8601String(),
            'archived_at' => $u->archived_at?->toIso8601String(),
        ] + $this->accountExtras($u);
    }

    /**
     * Chips (player wallet for players, allocation wallet otherwise) and commission balances, in one query.
     *
     * @param  Collection<int, User>  $users
     * @return array<int, array{chips: int, commission: int}>
     */
    protected function balancesFor(Collection $users): array
    {
        $out = [];
        $rows = Wallet::query()->whereIn('user_id', $users->pluck('id'))->where('currency', Currency::CH->value)->get(['user_id', 'type', 'balance']);
        foreach ($users as $u) {
            $mine = $rows->where('user_id', $u->id);
            $chipsType = $u->isPlayer() ? WalletType::Player : WalletType::Allocation;
            $out[$u->id] = [
                'chips' => (int) ($mine->first(fn ($w) => $w->type === $chipsType)?->balance ?? 0),
                'commission' => (int) ($mine->first(fn ($w) => $w->type === WalletType::Commission)?->balance ?? 0),
            ];
        }

        return $out;
    }

    /** @return array{id: int, username: string, name: string, account_type: string, account_type_label: string} */
    protected function who(User $u): array
    {
        return ['id' => $u->id, 'username' => $u->username, 'name' => $u->name, 'account_type' => $u->accountType(), 'account_type_label' => $u->accountTypeLabel()];
    }

    public static function typeLabel(string $type): string
    {
        return match ($type) {
            'player' => 'Player',
            'agent' => 'Agent',
            'master' => 'Master Agent',
            'silver' => 'Silver Agent',
            default => 'Administrator',
        };
    }

    /** @return array<string, mixed> */
    protected function amountRequest(Request $request): array
    {
        return $request->validate([
            'amount' => ['required', 'regex:/^\d{1,13}(\.\d{1,2})?$/'],
            'note' => ['nullable', 'string', 'max:255'],
            'idempotency_key' => ['nullable', 'string', 'max:64'],
        ]);
    }

    protected function minor(string $amount): int
    {
        $minor = Points::toMinor($amount);
        if ($minor <= 0) {
            throw new BusinessRuleException('Enter an amount greater than zero.', 422, 'invalid_amount');
        }

        return $minor;
    }

    protected function perPage(Request $request): int
    {
        return max(5, min(100, (int) $request->integer('per_page', 15)));
    }

    /**
     * @param  \Illuminate\Contracts\Pagination\LengthAwarePaginator  $page
     * @param  array<string, mixed>  $meta
     */
    protected function paged($page, callable $map, array $meta = []): JsonResponse
    {
        return response()->json([
            'data' => collect($page->items())->map($map)->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()] + $meta,
        ]);
    }
}
