<?php

namespace App\Events\Game;

/**
 * Event broadcast to everyone seated at a table.
 */
class TableEvent extends GameBroadcast
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function __construct(public int $tableId, public string $name, public array $payload = []) {}

    public function broadcastOn(): array
    {
        return [$this->tableChannel($this->tableId)];
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
        return ['table_id' => $this->tableId, 'event' => $this->name, 'at' => now()->toIso8601String()] + $this->payload;
    }
}
