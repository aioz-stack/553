<?php

namespace App\Events\Game;

/**
 * Event broadcast privately to a single player (e.g. their dealt cards).
 */
class UserEvent extends GameBroadcast
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function __construct(public int $userId, public string $name, public array $payload = []) {}

    public function broadcastOn(): array
    {
        return [$this->userChannel($this->userId)];
    }

    public function broadcastAs(): string
    {
        return $this->name;
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return ['event' => $this->name, 'at' => now()->toIso8601String()] + $this->payload;
    }
}
