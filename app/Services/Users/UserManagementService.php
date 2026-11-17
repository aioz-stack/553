<?php

namespace App\Services\Users;

use App\Enums\Ability;
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
 * Account creation and hierarchy rules:
 *  - only Super Admin creates Super Admins and Administrators;
 *  - Super Admin or an Administrator with manage_agents creates Agents;
 *  - Super Admin, an Administrator with manage_players, or an Agent creates Players
 *    (a player created by an agent is owned by that agent);
 *  - agents can never create agents or administrators.
 */
class UserManagementService
{
    public function __construct(private readonly WalletService $wallets) {}

    /**
     * @param  array{name: string, username: string, email: string, password: string, phone?: string|null}  $data
     */
    public function create(?User $actor, Role $role, array $data, ?string $referralCode = null): User
    {
        $this->authorizeCreate($actor, $role);

        return DB::transaction(function () use ($actor, $role, $data, $referralCode) {
            $user = new User($data);
            $user->forceFill([
                'role' => $role,
                'status' => UserStatus::Active,
                'created_by' => $actor?->id,
            ])->save();

            $this->wallets->provision($user);

            if ($role === Role::Player) {
                $user->profile()->create(['display_name' => $user->name]);
            }

            if ($role === Role::Agent) {
                Agent::create([
                    'user_id' => $user->id,
                    'code' => $this->uniqueAgentCode(),
                    'status' => 'active',
                    'created_by' => $actor?->id,
                ]);
            }

            if ($role === Role::Player && $actor?->isAgent()) {
                $this->linkPlayer($actor->agent, $user, $actor);
            } elseif ($role === Role::Player && $referralCode) {
                $this->applyReferral($user, $referralCode);
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

        $link = AgentPlayer::query()->updateOrCreate(
            ['player_id' => $player->id],
            ['agent_id' => $agent->id, 'assigned_by' => $actor->id, 'assigned_at' => now()],
        );

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

    public function authorizeCreate(?User $actor, Role $role): void
    {
        $allowed = match (true) {
            $actor === null => $role === Role::Player, // public self-registration
            $actor->isSuperAdmin() => true,
            $actor->isAdministrator() => match ($role) {
                Role::Agent => $actor->hasAbility(Ability::ManageAgents),
                Role::Player => $actor->hasAbility(Ability::ManagePlayers),
                default => false,
            },
            $actor->isAgent() => $role === Role::Player,
            default => false,
        };

        if (! $allowed) {
            throw new BusinessRuleException("You are not allowed to create {$role->label()} accounts.", 403, 'forbidden');
        }
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

    private function applyReferral(User $player, string $code): void
    {
        $referral = AgentReferralCode::query()->where('code', strtoupper($code))->lockForUpdate()->first();

        if ($referral === null || ! $referral->isUsable()) {
            throw new BusinessRuleException('The referral code is invalid or expired.');
        }

        $referral->increment('uses');
        $this->linkPlayer($referral->agent, $player, null, $referral->id);
    }

    private function uniqueAgentCode(): string
    {
        do {
            $code = 'AG'.strtoupper(Str::random(6));
        } while (Agent::query()->where('code', $code)->exists());

        return $code;
    }
}
