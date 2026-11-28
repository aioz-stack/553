<?php

namespace App\Events\Game;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Base class for real-time game events.
 *
 * - Table-wide events go to the presence channel `table.{tableId}`, which
 *   only seated players (and staff) may join — see routes/channels.php.
 * - Private per-player data (dealt cards) goes to `private-user.{id}`.
 * - Sent to Reverb straight away (not through the queue), so every player at
 *   the table gets a phase change at the same moment instead of whenever a
 *   queue worker picks the broadcast up.
 * - Dispatched only after the surrounding DB transaction commits
 *   (ShouldDispatchAfterCommit), so clients never see state that was rolled
 *   back, and never re-read state before it is saved.
 * - A failed send (Reverb down) is reported, never thrown (ShouldRescue): the
 *   game state is already saved and clients also poll, so a request must not
 *   fail because a broadcast did.
 * - Payloads never contain other players' cards before REVEALING, nor any
 *   wallet balances.
 */
abstract class GameBroadcast implements ShouldBroadcastNow, ShouldDispatchAfterCommit, ShouldRescue
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    protected function tableChannel(int $tableId): PresenceChannel
    {
        return new PresenceChannel('table.'.$tableId);
    }

    protected function userChannel(int $userId): PrivateChannel
    {
        return new PrivateChannel('user.'.$userId);
    }
}
