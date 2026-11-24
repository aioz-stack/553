<?php

namespace App\Services\Users;

use App\Enums\Ability;
use App\Enums\LoaderPermission;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\AuditLog;
use App\Models\ChipLoad;
use App\Models\Permission;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Admin Panel → Users / Employees: staff accounts with their own sign-in.
 *  - Loader Accounts: created and managed by any Admin (Super Admin / Administrator);
 *  - Administrators: created and managed by the Super Admin only;
 *  - Super Admins and your own account are never managed here.
 * Every change is audited; deactivating revokes the account's app tokens and web sessions at once.
 */
class EmployeeService
{
    public function __construct(private readonly UserManagementService $users) {}

    public static function isAdmin(User $actor): bool
    {
        return $actor->isActive() && ($actor->isSuperAdmin() || $actor->isAdministrator());
    }

    /** Roles $actor may manage (and create). @return list<Role> */
    public static function manageableRoles(User $actor): array
    {
        if (! self::isAdmin($actor)) {
            return [];
        }

        return $actor->isSuperAdmin() ? [Role::Loader, Role::Administrator] : [Role::Loader];
    }

    public function assertCanManage(User $actor, User $employee): void
    {
        if ($employee->id === $actor->id || ! in_array($employee->role, self::manageableRoles($actor), true)) {
            throw new BusinessRuleException('You cannot manage this account.', 403, 'forbidden');
        }
    }

    /**
     * @param  array{name: string, username: string, email: string, password: string, phone?: string|null}  $data
     * @param  list<string>  $permissions
     */
    public function create(User $actor, Role $role, array $data, array $permissions): User
    {
        if (! in_array($role, self::manageableRoles($actor), true)) {
            throw new BusinessRuleException("You cannot create {$role->label()} accounts.", 403, 'forbidden');
        }

        return DB::transaction(function () use ($actor, $role, $data, $permissions) {
            // UserManagementService applies the hierarchy rule again and makes $actor the creator
            // (a Loader's employer: the Admin whose Chips it loads).
            $employee = $this->users->create($actor, $role, $data);
            $this->setPermissions($actor, $employee, $permissions, audit: false);
            AuditLogger::log($actor, 'employee.created', $employee, null, ['role' => $role->value, 'permissions' => $permissions]);

            return $employee->fresh();
        });
    }

    /** @param  array{name?: string, email?: string, phone?: string|null}  $data */
    public function update(User $actor, User $employee, array $data): User
    {
        $this->assertCanManage($actor, $employee);
        $old = $employee->only(array_keys($data));
        $employee->forceFill($data)->save();
        AuditLogger::log($actor, 'employee.updated', $employee, $old, $data);

        return $employee;
    }

    /** @param  list<string>  $permissions */
    public function setPermissions(User $actor, User $employee, array $permissions, bool $audit = true): void
    {
        $this->assertCanManage($actor, $employee);

        if ($employee->isAdministrator()) {
            // Super Admin only (assertCanManage) — the existing Administrator abilities.
            $this->users->syncPermissions($actor, $employee, array_values(array_intersect($permissions, array_map(fn (Ability $a) => $a->value, Ability::cases()))));

            return;
        }

        // Loader Accounts can only ever hold the three Loader permissions.
        $keys = array_values(array_intersect($permissions, LoaderPermission::values()));
        $old = $employee->permissions()->pluck('key')->all();
        $employee->permissions()->syncWithPivotValues(Permission::query()->whereIn('key', $keys)->pluck('id'), ['granted_by' => $actor->id]);

        if ($audit) {
            AuditLogger::log($actor, 'employee.permissions', $employee, ['permissions' => $old], ['permissions' => $keys]);
        }
    }

    public function setActive(User $actor, User $employee, bool $active, ?string $reason = null): User
    {
        $this->assertCanManage($actor, $employee);

        return DB::transaction(function () use ($actor, $employee, $active, $reason) {
            $old = $employee->status->value;
            $employee->forceFill([
                'status' => $active ? UserStatus::Active : UserStatus::Suspended,
                'status_reason' => $active ? null : ($reason ?: 'Deactivated by an Admin'),
                'status_changed_at' => now(),
                'status_changed_by' => $actor->id,
            ])->save();

            if (! $active) {
                $this->endSessions($employee);
            }

            AuditLogger::log($actor, $active ? 'employee.activated' : 'employee.deactivated', $employee, ['status' => $old], ['status' => $employee->status->value, 'reason' => $reason]);

            return $employee;
        });
    }

    public function resetPassword(User $actor, User $employee, string $password): void
    {
        $this->assertCanManage($actor, $employee);

        DB::transaction(function () use ($actor, $employee, $password) {
            $employee->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
            $this->endSessions($employee);
            AuditLogger::log($actor, 'employee.password_reset', $employee, null, ['target' => $employee->username, 'reset_by' => $actor->username]);
        });
    }

    /** Delete only an account that never did anything; otherwise it must be deactivated (history stays attributed). */
    public function delete(User $actor, User $employee): void
    {
        $this->assertCanManage($actor, $employee);

        $hasHistory = AuditLog::query()->where('actor_id', $employee->id)->exists()
            || ChipLoad::query()->where('processed_by', $employee->id)->orWhere('sender_id', $employee->id)->exists()
            || WalletTransaction::query()->where('created_by', $employee->id)->orWhere('approved_by', $employee->id)->exists()
            || $employee->wallets()->where('balance', '>', 0)->exists();

        if ($hasHistory) {
            throw new BusinessRuleException('This account has activity on record. Deactivate it instead, so its history stays attributed.', 409, 'has_history');
        }

        DB::transaction(function () use ($actor, $employee) {
            AuditLogger::log($actor, 'employee.deleted', null, ['id' => $employee->id, 'username' => $employee->username, 'role' => $employee->role->value]);
            $this->endSessions($employee);
            $employee->permissions()->detach();
            $employee->wallets()->delete();
            $employee->delete();
        });
    }

    /** @return array<string, mixed> */
    public function activity(User $actor, User $employee): array
    {
        $this->assertCanManage($actor, $employee);

        return [
            'counts' => [
                'loads_processed' => ChipLoad::query()->where('processed_by', $employee->id)->count(),
                'password_resets' => AuditLog::query()->where('actor_id', $employee->id)->where('action', 'user.password_reset')->count(),
                'withdrawals_reviewed' => AuditLog::query()->where('actor_id', $employee->id)->whereIn('action', ['commission_withdrawal.approve', 'commission_withdrawal.reject'])->count(),
                'actions' => AuditLog::query()->where('actor_id', $employee->id)->count(),
            ],
            'last_login_at' => $employee->last_login_at?->toIso8601String(),
            'recent' => AuditLog::query()->where('actor_id', $employee->id)->latest('id')->limit(40)->get()->map(fn (AuditLog $l) => [
                'action' => $l->action,
                'subject' => $l->subject_type ? class_basename($l->subject_type).' #'.$l->subject_id : null,
                'details' => collect($l->new_values ?? [])->except(['password'])->all(),
                'ip' => $l->ip_address,
                'at' => $l->created_at?->toIso8601String(),
            ]),
        ];
    }

    private function endSessions(User $employee): void
    {
        $employee->tokens()->delete();

        if (config('session.driver') === 'database') {
            DB::table(config('session.table', 'sessions'))->where('user_id', $employee->id)->delete();
        }
    }
}
