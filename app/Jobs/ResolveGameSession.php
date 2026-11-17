<?php

namespace App\Jobs;

use App\Models\GameSession;
use App\Services\Game\GameEngine;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Reveal → score → settle → complete. Unique per session so concurrent
 * dispatches never overlap; the engine itself is idempotent per state.
 */
class ResolveGameSession implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    /**
     * @var list<int>
     */
    public array $backoff = [5, 15, 30, 60];

    public int $uniqueFor = 120;

    public function __construct(public int $sessionId) {}

    public function uniqueId(): string
    {
        return (string) $this->sessionId;
    }

    public function handle(GameEngine $engine): void
    {
        $session = GameSession::query()->find($this->sessionId);

        if ($session !== null) {
            $engine->resolve($session);
        }
    }
}
