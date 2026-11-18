<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Resources\UserResource;
use App\Models\AdministratorLimit;
use App\Models\Agent;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Users\UserManagementService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Users, players, agents and administrators (by `role` filter or route default).
 */
class UserController extends Controller
{
    public function __construct(private readonly UserManagementService $users) {}

    public function index(Request $request, ?string $role = null): AnonymousResourceCollection
    {
        $role = $role ?? $request->input('role');
        $this->authorizeList($request->user(), $role);

        $users = User::query()
            ->with(['profile', 'agent', 'agentLink.agent.user'])
            ->when($role, fn ($q) => $q->where('role', $role))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('agent_id'), fn ($q) => $q->whereHas('agentLink', fn ($l) => $l->where('agent_id', $request->integer('agent_id'))))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->input('search').'%';
                $q->where(fn ($w) => $w->where('name', 'like', $term)->orWhere('username', 'like', $term)->orWhere('email', 'like', $term));
            })
            ->latest('id')
            ->paginate(min((int) $request->integer('per_page', 20), 100))
            ->withQueryString();

        return UserResource::collection($users);
    }

    public function store(StoreUserRequest $request, ?string $role = null): JsonResponse
    {
        $role = Role::from($role ?? $request->input('role', Role::Player->value));
        $data = $request->validated();

        $user = DB::transaction(function () use ($request, $role, $data) {
            $user = $this->users->create($request->user(), $role, collect($data)->only(['name', 'username', 'email', 'phone', 'password'])->all());

            if ($role === Role::Administrator && ! empty($data['permissions'])) {
                $this->users->syncPermissions($request->user(), $user, $data['permissions']);
            }

            if ($role === Role::Player && ! empty($data['agent_id'])) {
                $this->users->assignPlayer($request->user(), $user, Agent::query()->findOrFail($data['agent_id']));
            }

            return $user;
        });

        return response()->json(['data' => (new UserResource($user->load(['profile', 'agent'])))->resolve($request)], 201);
    }

    public function show(Request $request, User $user): UserResource
    {
        $this->authorize('manage', $user);

        return new UserResource($user->load(['profile', 'agent', 'agentLink.agent.user', 'permissions']));
    }

    public function update(Request $request, User $user): UserResource
    {
        $this->authorize('manage', $user);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'password' => ['sometimes', 'nullable', 'string', 'min:8'],
        ]);

        if (blank($data['password'] ?? null)) {
            unset($data['password']);
        }

        $user->fill($data)->save();
        AuditLogger::log($request->user(), 'user.update', $user, null, array_keys($data));

        return new UserResource($user->fresh(['profile', 'agent']));
    }

    public function setStatus(Request $request, User $user): UserResource
    {
        $this->authorize('manage', $user);
        $data = $request->validate(['status' => ['required', Rule::enum(UserStatus::class)]]);

        return new UserResource($this->users->setStatus($request->user(), $user, UserStatus::from($data['status'])));
    }

    public function assignAgent(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['agent_id' => ['required', 'integer', 'exists:agents,id']]);
        $link = $this->users->assignPlayer($request->user(), $user, Agent::query()->findOrFail($data['agent_id']));

        return response()->json(['data' => ['player_id' => $link->player_id, 'agent_id' => $link->agent_id]]);
    }

    public function permissions(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['permissions' => ['present', 'array'], 'permissions.*' => [Rule::enum(Ability::class)]]);
        $this->users->syncPermissions($request->user(), $user, $data['permissions']);

        return response()->json(['data' => ['permissions' => $user->permissions()->pluck('key')]]);
    }

    public function limits(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin() && $user->isAdministrator(), 403);

        $data = $request->validate([
            'currency' => ['required', Rule::enum(Currency::class)->only(Currency::multiplayer())],
            'max_per_transaction' => ['nullable', 'regex:/^\d{1,13}(\.\d{1,2})?$/'],
            'daily_limit' => ['nullable', 'regex:/^\d{1,13}(\.\d{1,2})?$/'],
        ]);

        $limit = AdministratorLimit::query()->updateOrCreate(
            ['user_id' => $user->id, 'currency' => $data['currency']],
            [
                'max_per_transaction' => isset($data['max_per_transaction']) ? Points::toMinor($data['max_per_transaction']) : null,
                'daily_limit' => isset($data['daily_limit']) ? Points::toMinor($data['daily_limit']) : null,
            ],
        );

        AuditLogger::log($request->user(), 'admin.limits', $user, null, $limit->only(['currency', 'max_per_transaction', 'daily_limit']));

        return response()->json(['data' => $limit]);
    }

    private function authorizeList(User $actor, ?string $role): void
    {
        $allowed = match ($role) {
            Role::Player->value => $actor->hasAbility(Ability::ManagePlayers),
            Role::Agent->value => $actor->hasAbility(Ability::ManageAgents),
            default => $actor->isSuperAdmin(),
        };

        abort_unless($allowed, 403);
    }
}
