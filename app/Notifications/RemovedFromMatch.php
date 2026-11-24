<?php

namespace App\Notifications;

use App\Models\GameTable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Multiplayer update: the player stayed offline for too many rounds in a row and was removed from
 * the match (every round they were dealt into was completed and settled first).
 */
class RemovedFromMatch extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public GameTable $table, public int $roundsPlayed) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $name = $this->table->room?->name ?? 'the match';

        return [
            'title' => 'Removed from the match',
            'message' => "You were offline for several rounds, so you were removed from {$name} after round {$this->roundsPlayed}. Your finished rounds were settled.",
            'room_id' => $this->table->game_room_id,
        ];
    }
}
