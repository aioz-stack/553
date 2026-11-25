<?php

namespace App\Jobs;

use App\Models\GameSession;
use App\Services\Game\GameEngine;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Fires at the arrangement deadline. Safe to run late or more than once;
 * the `pusoy:sweep` scheduler command is the safety net if it never runs.
 */
class ExpireArrangement implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public function __construct(public int $sessionId) {}

    public function handle(GameEngine $engine): void
    {
        $session = GameSession::query()->find($this->sessionId);

        if ($session === null) {
            return;
        }

        $expiresAt = $engine->expiresAt($session);

        if ($expiresAt->isFuture()) {
            // Deadline (+ grace) not reached, moved, or the job ran early: try again then.
            $this->release(max(1, (int) ceil(now()->diffInSeconds($expiresAt, false))));

            return;
        }

        $engine->expire($session);
    }
}
