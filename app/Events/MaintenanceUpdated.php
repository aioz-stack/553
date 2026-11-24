<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * The maintenance mode changed. Public channel "maintenance" (the mode is public — the mobile
 * game shows the maintenance screen even before sign-in). Dispatched by MaintenanceService
 * after commit and sent at once, so open apps and panels switch without a queue worker.
 */
class MaintenanceUpdated implements ShouldBroadcastNow
{
    use Dispatchable;

    /** @param  array<string, mixed>  $status */
    public function __construct(public array $status) {}

    public function broadcastOn(): Channel
    {
        return new Channel('maintenance');
    }

    public function broadcastAs(): string
    {
        return 'maintenance.updated';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return $this->status;
    }
}
