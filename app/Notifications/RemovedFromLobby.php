<?php

namespace App\Notifications;

use App\Models\GameRoom;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Multiplayer lobby update: the lobby owner removed the player before the game started
 * (their reserved Chips were already returned by TableService::leave).
 */
class RemovedFromLobby extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public GameRoom $room, public User $by) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'title' => 'Removed from lobby',
            'message' => "{$this->by->username} removed you from {$this->room->name} before the game started. Your Chips were returned.",
            'room_id' => $this->room->id,
        ];
    }
}
