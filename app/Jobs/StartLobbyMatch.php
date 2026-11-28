<?php

namespace App\Jobs;

use App\Models\GameTable;
use App\Services\Game\BankerMatchService;
use App\Services\Game\LobbyService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Fires when a lobby's synchronized countdown ends and starts the match on the server, so the start
 * never waits for a player's app to ask. LobbyService::tick() does the work: row-locked and
 * idempotent, so it is safe alongside the players' own lobby requests at 0 (whichever comes first
 * starts the match; the rest see it started) and the `pusoy:sweep` safety net.
 */
class StartLobbyMatch implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public function __construct(public int $tableId) {}

    public function handle(LobbyService $lobbies, BankerMatchService $match): void
    {
        $table = GameTable::query()->find($this->tableId);

        if ($table === null || $table->countdown_ends_at === null) {
            return; // cancelled, or already started
        }

        if ($table->countdown_ends_at->isFuture()) {
            $this->release(max(1, (int) ceil(now()->diffInMilliseconds($table->countdown_ends_at, false) / 1000)));

            return;
        }

        $lobbies->tick($table, $match);
    }
}
