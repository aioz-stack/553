<?php

namespace App\Notifications;

use App\Models\User;
use App\Notifications\Channels\PushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class FriendRequest extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public User $from, public bool $accepted = false) {}

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
            'title' => $this->accepted ? 'Friend request accepted' : 'Friend request',
            'message' => $this->accepted
                ? "{$this->from->name} accepted your friend request."
                : "{$this->from->name} (@{$this->from->username}) wants to be friends.",
            'from_user_id' => $this->from->id,
        ];
    }

    /**
     * @return array{title: string, body: string, data: array<string, string>}
     */
    public function toPush(object $notifiable): array
    {
        $data = $this->toArray($notifiable);

        return ['title' => $data['title'], 'body' => $data['message'], 'data' => ['type' => 'friend_request', 'user_id' => (string) $this->from->id]];
    }
}
