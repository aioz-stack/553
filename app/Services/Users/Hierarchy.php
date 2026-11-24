<?php

namespace App\Services\Users;

use App\Enums\Ability;
use App\Enums\AgentLevel;
use App\Enums\Role;
use App\Exceptions\BusinessRuleException;
use App\Models\User;

/**
 * The one account-creation rule of the platform. Every path that creates an account — the
 * registration links, approval of a pending registration, and staff/agent account creation —
 * asks this class, so no form, link or API call can step outside it:
 *
 *   Admin (Super Admin / Administrator) → creates Agents
 *   Agent                               → creates Master Agents and Players
 *   Master Agent                        → creates Silver Agents and Players
 *   Silver Agent                        → creates Players only
 *   Player                              → creates nothing
 *
 * Platform staff (Super Admins and Administrators) are created only by a Super Admin; that is
 * platform administration, outside the agent hierarchy.
 */
final class Hierarchy
{
    /** The agent level $creator may create, or null when it may create no agents. */
    public static function agentLevelFor(User $creator): ?AgentLevel
    {
        if (! $creator->isActive()) {
            return null;
        }

        if ($creator->isSuperAdmin() || $creator->isAdministrator()) {
            return AgentLevel::Agent;
        }

        if ($creator->isAgent()) {
            return $creator->agent?->level?->recruits();
        }

        return null;
    }

    /** Players are created only by agents (any level), directly under their own account. */
    public static function canCreatePlayers(User $creator): bool
    {
        return $creator->isActive() && $creator->isAgent() && $creator->agent !== null;
    }

    /**
     * Throws unless $creator may create an account of $role. For agents, returns the level the
     * new agent gets (always derived from the creator, never chosen by the request).
     */
    public static function assertCanCreate(?User $creator, Role $role): ?AgentLevel
    {
        $deny = fn (string $why) => new BusinessRuleException($why, 403, 'hierarchy_forbidden');

        if ($creator === null) {
            throw $deny('Accounts are created only by an authorized account or through its registration link.');
        }

        return match ($role) {
            Role::Player => self::canCreatePlayers($creator) ? null : throw $deny('Only Agents, Master Agents and Silver Agents can create players.'),
            Role::Agent => self::agentLevelFor($creator) ?? throw $deny($creator->isAgent()
                ? 'Silver Agents can create players only.'
                : 'You are not allowed to create agent accounts.'),
            Role::Administrator, Role::SuperAdmin => $creator->isSuperAdmin() ? null : throw $deny('Only a Super Admin can create administrator accounts.'),
        };
    }

    /** Staff creating Agents directly also needs the manage_agents ability (Super Admin has all). */
    public static function assertStaffAbility(User $creator, Role $role): void
    {
        if ($role === Role::Agent && $creator->isAdministrator() && ! $creator->hasAbility(Ability::ManageAgents)) {
            throw new BusinessRuleException('You are not allowed to create agent accounts.', 403, 'forbidden');
        }
    }

    /**
     * What $creator may create, for the UI (links and buttons): ['agent_level' => ?AgentLevel, 'players' => bool].
     *
     * @return array{agent_level: AgentLevel|null, players: bool}
     */
    public static function options(User $creator): array
    {
        return ['agent_level' => self::agentLevelFor($creator), 'players' => self::canCreatePlayers($creator)];
    }
}
