<?php

namespace App\Services\Users;

use App\Enums\Ability;
use App\Enums\UserStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ban, suspend, reactivate, archive and restore accounts (Admin Panel → Ban Users / Archive).
 *
 * Banned, suspended and archived accounts cannot sign in (their tokens are revoked at
 * once and EnsureActiveAccount refuses every request), so they cannot play or move
 * Chips. Nothing is ever deleted: wallets, ledger rows, commissions and the referral
 * relationships stay intact; Reactivate / Restore make the account Active again.
 * The reason, date and staff member are recorded on the account and in the audit log.
 */
class AccountStatusService
{
    /** Ban or suspend an active (or already blocked) account, with a reason. */
    public function block(User $actor, User $target, UserStatus $status, string $reason): User
    {
        if (! in_array($status, [UserStatus::Banned, UserStatus::Suspended], true)) {
            throw new BusinessRuleException('Choose ban or suspend.', 422, 'invalid_status');
        }

        return $this->change($actor, $target, $status, $reason, [UserStatus::Active, UserStatus::Suspended, UserStatus::Banned]);
    }

    /** Lift a ban or suspension. */
    public function reactivate(User $actor, User $target, ?string $reason = null): User
    {
        return $this->change($actor, $target, UserStatus::Active, $reason, [UserStatus::Suspended, UserStatus::Banned]);
    }

    /** Retire an account; its history and referral relationships are kept. */
    public function archive(User $actor, User $target, ?string $reason = null): User
    {
        return $this->change($actor, $target, UserStatus::Archived, $reason, [UserStatus::Active, UserStatus::Suspended, UserStatus::Banned]);
    }

    /** Bring an archived account back. */
    public function restore(User $actor, User $target, ?string $reason = null): User
    {
        return $this->change($actor, $target, UserStatus::Active, $reason, [UserStatus::Archived]);
    }

    /**
     * @param  list<UserStatus>  $from
     */
    private function change(User $actor, User $target, UserStatus $to, ?string $reason, array $from): User
    {
        $this->authorize($actor, $target);

        return DB::transaction(function () use ($actor, $target, $to, $reason, $from) {
            /** @var User $target */
            $target = User::query()->lockForUpdate()->findOrFail($target->id);

            if (! in_array($target->status, $from, true)) {
                throw new BusinessRuleException("A {$target->status->value} account cannot be changed to {$to->value}.", 409, 'invalid_state');
            }

            $old = $target->status;
            $target->forceFill([
                'status' => $to,
                'status_reason' => $reason,
                'status_changed_at' => now(),
                'status_changed_by' => $actor->id,
                'archived_at' => $to === UserStatus::Archived ? now() : ($old === UserStatus::Archived ? null : $target->archived_at),
            ])->save();

            if ($to !== UserStatus::Active) {
                // Signed out everywhere at once.
                $target->tokens()->delete();
                if (Schema::hasTable('sessions')) {
                    DB::table('sessions')->where('user_id', $target->id)->delete();
                }
            }

            AuditLogger::log($actor, 'user.status', $target, ['status' => $old->value], ['status' => $to->value, 'reason' => $reason]);

            return $target;
        });
    }

    private function authorize(User $actor, User $target): void
    {
        if ($target->id === $actor->id) {
            throw new BusinessRuleException('You cannot change the status of your own account.', 403, 'forbidden');
        }

        if ($target->isSuperAdmin() || ($target->isAdministrator() && ! $actor->isSuperAdmin())) {
            throw new BusinessRuleException('You cannot change the status of this account.', 403, 'forbidden');
        }

        $ability = $target->isPlayer() ? Ability::ManagePlayers : Ability::ManageAgents;

        if (! $actor->isSuperAdmin() && ! ($actor->isAdministrator() && $actor->hasAbility($ability))) {
            throw new BusinessRuleException('You are not allowed to manage this account.', 403, 'forbidden');
        }
    }
}
