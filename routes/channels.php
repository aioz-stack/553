<?php

use App\Enums\Ability;
use App\Models\GamePlayer;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

/*
| Private per-user channel: dealt cards and personal notifications.
| Only the owner may subscribe.
*/
Broadcast::channel('user.{id}', function (User $user, int $id) {
    return $user->id === $id;
});

/*
| Presence channel per table. Only players seated at the table (or staff
| with manage_games, for monitoring) may join. Returns the presence member
| info shown to other players — never balances.
*/
Broadcast::channel('table.{tableId}', function (User $user, int $tableId) {
    $seat = GamePlayer::query()->where('game_table_id', $tableId)->where('user_id', $user->id)->first();

    if ($seat) {
        return ['id' => $user->id, 'name' => $user->name, 'seat' => $seat->seat];
    }

    if ($user->hasAbility(Ability::ManageGames)) {
        return ['id' => $user->id, 'name' => $user->name, 'seat' => null, 'observer' => true];
    }

    return false;
});

/*
| Admin Panel refresh signals (no data, just "refetch"): Super Admin and Administrators.
*/
Broadcast::channel('staff', function (User $user) {
    return $user->isSuperAdmin() || $user->isAdministrator();
});
