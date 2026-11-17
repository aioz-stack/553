<?php

namespace App\Events\Game;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Base class for real-time game events.
 *
 * - Table-wide events go to the presence channel `table.{tableId}`, which
 *   only seated players (and staff) may join — see routes/channels.php.
 * - Private per-player data (dealt cards) goes to `private-user.{id}`.
 * - Events dispatch after the surrounding DB transaction commits, so
 *   clients never see state that was rolled back.
 * - Payloads never contain other players' cards before REVEALING, nor any
 *   wallet balances.
 */
abstract class GameBroadcast implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public bool $afterCommit = true;

    protected function tableChannel(int $tableId): PresenceChannel
    {
        return new PresenceChannel('table.'.$tableId);
    }

    protected function userChannel(int $userId): PrivateChannel
    {
        return new PrivateChannel('user.'.$userId);
    }
}
