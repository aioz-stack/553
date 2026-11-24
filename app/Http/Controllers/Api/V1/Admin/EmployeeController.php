<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Ability;
use App\Enums\LoaderPermission;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Users\EmployeeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Admin Panel → Users / Employees (Super Admin and Administrators; Administrators manage Loader
 * Accounts only). Every rule is checked again in EmployeeService.
 */
class EmployeeController extends Controller
{
    public function __construct(private readonly EmployeeService $employees) {}

    public function index(Request $request): JsonResponse
    {
        $actor = $this->admin($request);
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:64'],
            'role' => ['nullable', Rule::in(['loader', 'admin'])],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ]);
        $roles = array_map(fn (Role $r) => $r->value, EmployeeService::manageableRoles($actor));

        $page = User::query()->with('permissions')->whereIn('role', $roles)
            ->when($data['role'] ?? null, fn ($q, $role) => $q->where('role', $role))
            ->when($data['status'] ?? null, fn ($q, $s) => $s === 'active' ? $q->where('status', UserStatus::Active->value) : $q->where('status', '!=', UserStatus::Active->value))
            ->when($data['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->where('username', 'like', $like)->orWhere('name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('role', 'like', $like)->orWhere('id', ltrim($term, '#')));
            })
            ->latest('id')->paginate(max(5, min(100, $request->integer('per_page', 15))));

        return response()->json([
            'data' => collect($page->items())->map(fn (User $u) => $this->present($u))->values(),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage(),
                'roles' => array_map(fn (Role $r) => ['value' => $r->value, 'label' => $r === Role::Loader ? 'Loader Account' : $r->label()], EmployeeService::manageableRoles($actor)),
                'permissions' => [
                    'loader' => array_map(fn (LoaderPermission $p) => ['key' => $p->value, 'label' => $p->label(), 'description' => $p->description()], LoaderPermission::cases()),
                    'admin' => $actor->isSuperAdmin() ? array_map(fn (Ability $a) => ['key' => $a->value, 'label' => ucwords(str_replace('_', ' ', $a->value)), 'description' => $a->description()], Ability::cases()) : [],
                ],
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $this->admin($request);
        $data = $request->validate([
            'role' => ['required', Rule::in(['loader', 'admin'])],
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'min:3', 'max:32', 'alpha_dash', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:32'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers(), 'max:72'],
            'permissions' => ['array'],
            'permissions.*' => ['string', 'max:64'],
        ]);

        $employee = $this->employees->create($actor, Role::from($data['role']), collect($data)->only(['name', 'username', 'email', 'phone', 'password'])->all(), $data['permissions'] ?? []);

        return response()->json(['message' => "{$employee->username} created.", 'data' => $this->present($employee->load('permissions'))], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $actor = $this->admin($request);
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
        ]);

        return response()->json(['message' => 'Employee updated.', 'data' => $this->present($this->employees->update($actor, $user, $data)->load('permissions'))]);
    }

    public function permissions(Request $request, User $user): JsonResponse
    {
        $actor = $this->admin($request);
        $data = $request->validate(['permissions' => ['present', 'array'], 'permissions.*' => ['string', 'max:64']]);
        $this->employees->setPermissions($actor, $user, $data['permissions']);

        return response()->json(['message' => 'Permissions saved.', 'data' => $this->present($user->fresh('permissions'))]);
    }

    public function status(Request $request, User $user): JsonResponse
    {
        $actor = $this->admin($request);
        $data = $request->validate(['active' => ['required', 'boolean'], 'reason' => ['nullable', 'string', 'max:255']]);
        $employee = $this->employees->setActive($actor, $user, $data['active'], $data['reason'] ?? null);

        return response()->json(['message' => $data['active'] ? "{$employee->username} activated." : "{$employee->username} deactivated; signed out everywhere.", 'data' => $this->present($employee->load('permissions'))]);
    }

    public function password(Request $request, User $user): JsonResponse
    {
        $actor = $this->admin($request);
        $data = $request->validate(['password' => ['required', 'confirmed', Password::min(8)->letters()->numbers(), 'max:72']]);
        $this->employees->resetPassword($actor, $user, $data['password']);

        return response()->json(['message' => "Password reset for {$user->username}; open sign-ins were ended."]);
    }

    public function activity(Request $request, User $user): JsonResponse
    {
        return response()->json(['data' => $this->present($user->load('permissions')) + $this->employees->activity($this->admin($request), $user)]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->employees->delete($this->admin($request), $user);

        return response()->json(['message' => 'Employee deleted.']);
    }

    private function admin(Request $request): User
    {
        $actor = $request->user();
        abort_unless($actor && EmployeeService::isAdmin($actor), 403);

        return $actor;
    }

    /** @return array<string, mixed> */
    private function present(User $u): array
    {
        $creator = $u->created_by ? User::query()->find($u->created_by, ['id', 'username']) : null;

        return [
            'id' => $u->id,
            'account_id' => 'EM-'.str_pad((string) $u->id, 6, '0', STR_PAD_LEFT),
            'username' => $u->username,
            'name' => $u->name,
            'email' => $u->email,
            'phone' => $u->phone,
            'role' => $u->role->value,
            'role_label' => $u->isLoader() ? 'Loader Account' : $u->role->label(),
            'status' => $u->status->value,
            'status_reason' => $u->status_reason,
            'permissions' => $u->permissions->pluck('key')->values(),
            'employer' => $creator?->only(['id', 'username']),
            'last_login_at' => $u->last_login_at?->toIso8601String(),
            'created_at' => $u->created_at?->toIso8601String(),
        ];
    }
}
