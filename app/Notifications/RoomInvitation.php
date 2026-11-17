<?php

namespace App\Notifications;

use App\Models\GameRoom;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class RoomInvitation extends Notification
{
    use Queueable;

    public function __construct(public GameRoom $room, public User $inviter) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'title' => 'Room invitation',
            'message' => "{$this->inviter->name} invited you to {$this->room->name}.",
            'room_id' => $this->room->id,
            'invite_code' => $this->room->invite_code,
        ];
    }
}
