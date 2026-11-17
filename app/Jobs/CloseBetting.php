<?php

namespace App\Jobs;

use App\Models\GameSession;
use App\Services\Game\BankerMatchService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Fires at the betting deadline of a banker-mode round: auto-bets the
 * minimum for connected players who did not bet, then deals. Idempotent;
 * `pusoy:sweep` is the safety net.
 */
class CloseBetting implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public function __construct(public int $sessionId) {}

    public function handle(BankerMatchService $match): void
    {
        $session = GameSession::query()->find($this->sessionId);

        if ($session === null) {
            return;
        }

        if ($session->betting_deadline?->isFuture()) {
            $this->release(max(1, (int) now()->diffInSeconds($session->betting_deadline, false)));

            return;
        }

        $match->closeBetting($session);
    }
}
