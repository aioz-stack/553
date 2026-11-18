<?php

namespace App\Console\Commands;

use App\Enums\GameMode;
use App\Enums\GameStatus;
use App\Enums\TableStatus;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use App\Services\Game\LobbyService;
use App\Services\Game\TableService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

/**
 * Safety net for interrupted server operations. Scheduled every minute
 * (see routes/console.php); also safe to run by hand.
 */
#[Signature('pusoy:sweep')]
#[Description('Expire arrangement timers, retry stuck resolutions/settlements, detect disconnects and ready timeouts')]
class SweepGames extends Command
{
    public function handle(GameEngine $engine, TableService $tables, BankerMatchService $match, LobbyService $lobbies): int
    {
        $tables->sweep();
        // Multiplayer lobbies: countdowns, dropped players, seat release.
        $lobbies->sweep($match);

        GameSession::query()->where('status', GameStatus::Arranging->value)->get()->each(function (GameSession $session) use ($engine) {
            if ($session->arrangement_deadline->isPast()) {
                $engine->expire($session);
            } else {
                $engine->broadcastTimer($session);
            }
        });

        // Banker modes: betting deadlines and rounds whose intermission is over.
        GameSession::query()->where('status', GameStatus::Betting->value)->where('betting_deadline', '<', now())->get()
            ->each(fn (GameSession $session) => $match->closeBetting($session));

        GameTable::query()->where('status', TableStatus::InGame->value)->where('game_mode', '!=', GameMode::Classic->value)
            ->where(fn ($q) => $q->whereNull('next_round_at')->orWhere('next_round_at', '<', now()))
            ->get()
            ->each(function (GameTable $table) use ($match) {
                $current = $table->current_session_id ? GameSession::query()->find($table->current_session_id) : null;

                if ($current === null || ($current->status->isFinal() && $current->updated_at < now()->subSeconds(5))) {
                    $match->startRound($table);
                }
            });

        $stuck = GameSession::query()
            ->whereIn('status', [GameStatus::Submitted->value, GameStatus::Revealing->value, GameStatus::Scoring->value])
            ->where('updated_at', '<', now()->subSeconds(20))
            ->get();

        foreach ($stuck as $session) {
            try {
                $engine->resolve($session);
                $this->info("Resolved session #{$session->id}");
            } catch (Throwable $e) {
                $this->error("Session #{$session->id} still failing: {$e->getMessage()}");
                report($e);
            }
        }

        return self::SUCCESS;
    }
}
