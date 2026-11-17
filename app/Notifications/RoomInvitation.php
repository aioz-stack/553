<?php

namespace App\Notifications;

use App\Models\GameRoom;
use App\Models\User;
use App\Notifications\Channels\PushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class RoomInvitation extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public GameRoom $room, public User $inviter) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast', PushChannel::class];
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

    /**
     * @return array{title: string, body: string, data: array<string, string>}
     */
    public function toPush(object $notifiable): array
    {
        return [
            'title' => 'Room invitation',
            'body' => "{$this->inviter->name} invited you to {$this->room->name}.",
            'data' => ['type' => 'room_invitation', 'room_id' => (string) $this->room->id, 'invite_code' => (string) $this->room->invite_code],
        ];
    }
}
