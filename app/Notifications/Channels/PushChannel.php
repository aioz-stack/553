<?php

namespace App\Notifications\Channels;

use App\Models\User;
use App\Models\UserDevice;
use App\Services\Push\FcmClient;
use Illuminate\Notifications\Notification;

/**
 * Sends a notification to every mobile device the user registered a push
 * token for. Notifications opt in with via() => [PushChannel::class] and a
 * toPush() method returning ['title' => ..., 'body' => ..., 'data' => [...]].
 * Payloads must never include balances of other players or private cards.
 */
class PushChannel
{
    public function __construct(private readonly FcmClient $fcm) {}

    public function send(object $notifiable, Notification $notification): void
    {
        if (! $notifiable instanceof User || ! method_exists($notification, 'toPush')) {
            return;
        }

        $message = $notification->toPush($notifiable);

        $notifiable->devices()->whereNotNull('push_token')->get()->each(function (UserDevice $device) use ($message) {
            $valid = $this->fcm->send($device->push_token, $message['title'], $message['body'], $message['data'] ?? []);

            if (! $valid) {
                $device->forceFill(['push_token' => null])->save();
            }
        });
    }
}
