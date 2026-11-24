<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * "Something on your panel changed" — sent after commit to the accounts a Chips load,
 * commission, withdrawal or registration concerns (and their upline), and to the staff
 * channel. It carries no balances or personal data: open Admin / Agent Panels simply
 * refetch what they show, through the same authorized API.
 */
class PanelUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets;

    public bool $afterCommit = true;

    /** @param  list<int>  $userIds */
    public function __construct(public array $userIds, public string $kind) {}

    /** @return list<PrivateChannel> */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('staff'),
            ...array_map(fn (int $id) => new PrivateChannel('user.'.$id), array_values(array_unique($this->userIds))),
        ];
    }

    public function broadcastAs(): string
    {
        return 'panel.updated';
    }

    /** @return array<string, string> */
    public function broadcastWith(): array
    {
        return ['kind' => $this->kind];
    }
}
