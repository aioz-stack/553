<?php

namespace App\Services\Users;

use App\Enums\Ability;
use App\Enums\AgentLevel;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\Agent;
use App\Models\AgentPlayer;
use App\Models\AgentReferralCode;
use App\Models\Permission;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\WalletService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Account creation, following the one hierarchy rule (App\Services\Users\Hierarchy):
 *  - Admins create Agents (an Administrator also needs manage_agents);
 *  - Incorporators create Master Agents and Players, Master Agents create Players only — always directly under the creator;
 *  - only a Super Admin creates Super Admins and Administrators.
 * The creator is the permanent sponsor; an agent's level and parent come from the creator.
 */
class UserManagementService
{
    public function __construct(private readonly WalletService $wallets) {}

    /**
     * @param  array{name: string, username: string, email: string, password: string, phone?: string|null}  $data
     */
    public function create(?User $actor, Role $role, array $data): User
    {
        $level = $this->authorizeCreate($actor, $role);

        return DB::transaction(function () use ($actor, $role, $data, $level) {
            $user = new User($data);
            $user->forceFill([
                'role' => $role,
                'status' => UserStatus::Active,
                'created_by' => $actor?->id,
                // Accounts created by staff or an agent are active at once; the creator is the permanent sponsor.
                'sponsor_id' => $actor?->id,
                'referral_code' => ReferralService::newCode($data['username']),
                'approved_at' => now(),
                'approved_by' => $actor?->id,
            ])->save();

            $this->wallets->provision($user);

            if ($role === Role::Player) {
                $user->profile()->create(['display_name' => $user->name]);
            }

            if ($role === Role::Agent) {
                Agent::create([
                    'user_id' => $user->id,
                    'code' => $this->uniqueAgentCode(),
                    'level' => ($level ?? AgentLevel::Agent)->value,
                    'parent_agent_id' => $actor?->isAgent() ? $actor->agent?->id : null,
                    'status' => 'active',
                    'created_by' => $actor?->id,
                ]);
            }

            if ($role === Role::Player) {
                // Hierarchy guarantees the creator is an agent: the player is theirs.
                $this->linkPlayer($actor->agent, $user, $actor);
            }

            AuditLogger::log($actor ?? $user, 'user.create', $user, null, ['role' => $role->value, 'username' => $user->username]);

            return $user;
        });
    }

    /**
     * Assign (or re-assign) a player to an agent. Super Admin / manage_agents only.
     */
    public function assignPlayer(User $actor, User $player, Agent $agent): AgentPlayer
    {
        if (! $actor->hasAbility(Ability::ManageAgents)) {
            throw new BusinessRuleException('You are not allowed to assign players.', 403, 'forbidden');
        }

        if (! $player->isPlayer()) {
            throw new BusinessRuleException('Only players can be assigned to agents.');
        }

        // A registration waiting for (or refused) approval belongs to its link owner's queue:
        // moving it would hand the approval to someone else.
        if (in_array($player->status, [UserStatus::Pending, UserStatus::Rejected], true)) {
            throw new BusinessRuleException('Registrations waiting for approval cannot be re-assigned.', 409, 'sponsor_locked');
        }

        // The referral relationship is permanent: a player with an agent (or a sponsor agent) keeps it.
        if (AgentPlayer::query()->where('player_id', $player->id)->exists() || $player->sponsor?->isAgent()) {
            throw new BusinessRuleException('This player already has a sponsor; referral relationships cannot be changed.', 409, 'sponsor_locked');
        }

        $link = AgentPlayer::query()->create(['player_id' => $player->id, 'agent_id' => $agent->id, 'assigned_by' => $actor->id, 'assigned_at' => now()]);
        $player->forceFill(['sponsor_id' => $agent->user_id])->save();

        AuditLogger::log($actor, 'agent.assign_player', $link, null, ['agent_id' => $agent->id, 'player_id' => $player->id]);

        return $link;
    }

    /**
     * @param  list<string>  $abilities
     */
    public function syncPermissions(User $actor, User $administrator, array $abilities): void
    {
        if (! $actor->isSuperAdmin() || ! $administrator->isAdministrator()) {
            throw new BusinessRuleException('Only a Super Admin can change administrator permissions.', 403, 'forbidden');
        }

        $valid = array_map(fn (Ability $a) => $a->value, Ability::cases());
        $ids = Permission::query()->whereIn('key', array_intersect($abilities, $valid))->pluck('id');
        $old = $administrator->permissions()->pluck('key')->all();

        $administrator->permissions()->syncWithPivotValues($ids, ['granted_by' => $actor->id]);
        AuditLogger::log($actor, 'admin.permissions', $administrator, ['permissions' => $old], ['permissions' => $abilities]);
    }

    public function setStatus(User $actor, User $target, UserStatus $status): User
    {
        if ($target->role->level() >= $actor->role->level() && ! $actor->isSuperAdmin()) {
            throw new BusinessRuleException('You cannot change the status of this account.', 403, 'forbidden');
        }

        if ($target->isSuperAdmin() && $target->id === $actor->id) {
            throw new BusinessRuleException('You cannot suspend yourself.', 403, 'forbidden');
        }

        $old = $target->status->value;
        $target->forceFill(['status' => $status])->save();

        if ($status === UserStatus::Suspended) {
            $target->tokens()->delete();
        }

        AuditLogger::log($actor, 'user.status', $target, ['status' => $old], ['status' => $status->value]);

        return $target;
    }

    public function createReferralCode(Agent $agent, ?int $maxUses = null, ?\DateTimeInterface $expiresAt = null): AgentReferralCode
    {
        return $agent->referralCodes()->create([
            'code' => strtoupper($agent->code.'-'.Str::random(6)),
            'max_uses' => $maxUses,
            'expires_at' => $expiresAt,
            'is_active' => true,
        ]);
    }

    /**
     * The hierarchy rule (plus the staff ability for Administrators creating Agents). Returns
     * the level a new agent gets.
     */
    public function authorizeCreate(?User $actor, Role $role): ?AgentLevel
    {
        $level = Hierarchy::assertCanCreate($actor, $role);
        Hierarchy::assertStaffAbility($actor, $role);

        return $level;
    }

    private function linkPlayer(Agent $agent, User $player, ?User $actor, ?int $referralCodeId = null): void
    {
        AgentPlayer::create([
            'agent_id' => $agent->id,
            'player_id' => $player->id,
            'assigned_by' => $actor?->id,
            'referral_code_id' => $referralCodeId,
            'assigned_at' => now(),
        ]);
    }

    private function uniqueAgentCode(): string
    {
        do {
            $code = 'AG'.strtoupper(Str::random(6));
        } while (Agent::query()->where('code', $code)->exists());

        return $code;
    }
}
