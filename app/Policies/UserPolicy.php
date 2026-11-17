<?php

namespace App\Policies;

use App\Enums\Ability;
use App\Models\User;

/**
 * Who may view / manage another account.
 *  - Super Admin: everyone.
 *  - Administrator: players (manage_players) and agents (manage_agents); never admins.
 *  - Agent: only their own players.
 *  - Player: only themselves.
 */
class UserPolicy
{
    public function view(User $actor, User $target): bool
    {
        return $actor->id === $target->id || $this->manage($actor, $target);
    }

    public function manage(User $actor, User $target): bool
    {
        if (! $actor->isActive()) {
            return false;
        }

        if ($actor->isSuperAdmin()) {
            return true;
        }

        if ($actor->isAdministrator()) {
            return ($target->isPlayer() && $actor->hasAbility(Ability::ManagePlayers))
                || ($target->isAgent() && $actor->hasAbility(Ability::ManageAgents));
        }

        if ($actor->isAgent()) {
            return $target->isPlayer() && $actor->agent !== null && $actor->agent->owns($target);
        }

        return false;
    }
}
