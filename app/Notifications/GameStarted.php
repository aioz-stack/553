<?php

namespace App\Notifications;

use App\Models\GameSession;
use App\Notifications\Channels\PushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Push-only nudge when cards are dealt, so a player who backgrounded the
 * app does not miss the arrangement timer. Contains no card data.
 */
class GameStarted extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public GameSession $session) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return [PushChannel::class];
    }

    /**
     * @return array{title: string, body: string, data: array<string, string>}
     */
    public function toPush(object $notifiable): array
    {
        $seconds = (int) ($this->session->config['arrangement_seconds'] ?? 90);

        return [
            'title' => 'Cards dealt!',
            'body' => "Arrange your hands in {$seconds} seconds.",
            'data' => ['type' => 'game_started', 'table_id' => (string) $this->session->game_table_id, 'session_id' => (string) $this->session->id],
        ];
    }
}
