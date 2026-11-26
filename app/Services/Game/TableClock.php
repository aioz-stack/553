<?php

namespace App\Services\Game;

use App\Enums\GameMode;
use App\Enums\GameStatus;
use App\Enums\TableStatus;
use App\Models\GameSession;
use App\Models\GameTable;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Keeps one table's round moving whenever its players' apps look at it (table state, game state,
 * heartbeat), so a round never hangs at 0s when the queue worker or the scheduler is late or not
 * running (local development without `queue:work` / `schedule:work`). Every step is the same
 * idempotent, row-locked service call the queued jobs and `pusoy:sweep` make, so whichever runs
 * first wins and the others change nothing:
 *  - betting deadline passed      → BankerMatchService::closeBetting (auto-bets, deal)
 *  - arranging time + grace over  → GameEngine::expire (rows as they are), then the reveal
 *  - all submitted                → GameEngine::resolve (reveal, score, settle)
 *  - intermission over            → BankerMatchService::startRound
 */
class TableClock
{
    public function __construct(private readonly GameEngine $engine, private readonly BankerMatchService $match) {}

    public function tick(GameTable $table): void
    {
        // Almost every call (polls, heartbeats) finds nothing due: decide that from the rows already
        // at hand, without taking the lock or writing anything.
        if (! $this->due($table)) {
            return;
        }

        $lock = Cache::lock("table-clock:{$table->id}", 10);

        if (! $lock->get()) {
            return; // another request is already moving this table
        }

        try {
            $table->refresh();
            $session = $table->current_session_id ? GameSession::query()->find($table->current_session_id) : null;

            if ($session?->status === GameStatus::Betting && $session->betting_deadline?->isPast()) {
                $this->match->closeBetting($session);
                $session->refresh();
            }

            if ($session?->status === GameStatus::Arranging && $this->engine->expiresAt($session)->isPast()) {
                $this->engine->expire($session);
                $session->refresh();
            }

            if ($session && in_array($session->status, [GameStatus::Submitted, GameStatus::Revealing, GameStatus::Scoring], true)) {
                $this->engine->resolve($session);
                $session->refresh();
            }

            $table->refresh();
            if ($table->status === TableStatus::InGame && $table->game_mode !== GameMode::Classic
                && ($table->next_round_at === null || $table->next_round_at->isPast())
                && ($session === null || ($session->status->isFinal() && $session->updated_at < now()->subSeconds(5)))) {
                $this->match->startRound($table);
            }
        } catch (Throwable $e) {
            // The jobs and the sweep remain the safety net; a viewer's request never fails for this.
            report($e);
        } finally {
            $lock->release();
        }
    }

    /** Something to do now: a deadline passed, a round is waiting to resolve, or the next round is due. */
    private function due(GameTable $table): bool
    {
        if ($table->status !== TableStatus::InGame) {
            return false;
        }

        $session = $table->current_session_id ? GameSession::query()->find($table->current_session_id) : null;

        return match (true) {
            $session === null => $table->game_mode !== GameMode::Classic,
            $session->status === GameStatus::Betting => (bool) $session->betting_deadline?->isPast(),
            $session->status === GameStatus::Arranging => $this->engine->expiresAt($session)->isPast(),
            in_array($session->status, [GameStatus::Submitted, GameStatus::Revealing, GameStatus::Scoring], true) => true,
            $session->status->isFinal() => $table->game_mode !== GameMode::Classic && ($table->next_round_at === null || $table->next_round_at->isPast()) && $session->updated_at < now()->subSeconds(5),
            default => false,
        };
    }
}
