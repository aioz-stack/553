<?php

namespace App\Jobs;

use App\Models\GameTable;
use App\Services\Game\BankerMatchService;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Starts the next round of a banker-mode match after the intermission.
 * Idempotent: does nothing if a round is already running or the match ended.
 */
class StartNextRound implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public int $uniqueFor = 60;

    public function __construct(public int $tableId) {}

    public function uniqueId(): string
    {
        return (string) $this->tableId;
    }

    public function handle(BankerMatchService $match): void
    {
        $table = GameTable::query()->find($this->tableId);

        if ($table === null) {
            return;
        }

        if ($table->next_round_at?->isFuture()) {
            $this->release(max(1, (int) now()->diffInSeconds($table->next_round_at, false)));

            return;
        }

        $match->startRound($table);
    }
}
