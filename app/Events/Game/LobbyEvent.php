<?php

namespace App\Events\Game;

use Illuminate\Broadcasting\Channel;

/**
 * "A lobby changed" — broadcast on the public `lobbies` channel whenever a
 * multiplayer lobby is created, joined, left, readied, started, updated or
 * closed, so every open Lobby screen refreshes its list (counts, status).
 * Carries only public lobby info: never passwords, balances or cards.
 */
class LobbyEvent extends GameBroadcast
{
    public const UPDATED = 'lobby.updated';

    public function __construct(public int $roomId, public string $change) {}

    public function broadcastOn(): array
    {
        return [new Channel('lobbies')];
    }

    public function broadcastAs(): string
    {
        return self::UPDATED;
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return ['room_id' => $this->roomId, 'change' => $this->change, 'at' => now()->toIso8601String()];
    }
}
