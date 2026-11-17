<?php

namespace App\Policies;

use App\Enums\Ability;
use App\Models\GameSession;
use App\Models\User;

class GameSessionPolicy
{
    /**
     * Participants and staff with manage_games may view a session.
     * Card visibility within the session is enforced by GameStatePresenter.
     */
    public function view(User $user, GameSession $session): bool
    {
        return $session->hasParticipant($user)
            || $session->table?->hasPlayer($user)
            || $user->hasAbility(Ability::ManageGames);
    }

    /**
     * Banker rounds: seated players may bet before cards are dealt (the
     * service checks they are a participant of this round).
     */
    public function bet(User $user, GameSession $session): bool
    {
        return $user->isActive() && $session->isBankerRound() && (bool) $session->table?->hasPlayer($user);
    }

    public function play(User $user, GameSession $session): bool
    {
        return $user->isActive() && $session->hasParticipant($user);
    }

    public function cancel(User $user, GameSession $session): bool
    {
        return $user->hasAbility(Ability::ManageGames);
    }
}
