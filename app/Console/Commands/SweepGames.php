<?php

namespace App\Console\Commands;

use App\Enums\GameStatus;
use App\Models\GameSession;
use App\Services\Game\GameEngine;
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
    public function handle(GameEngine $engine, TableService $tables): int
    {
        $tables->sweep();

        GameSession::query()->where('status', GameStatus::Arranging->value)->get()->each(function (GameSession $session) use ($engine) {
            if ($session->arrangement_deadline->isPast()) {
                $engine->expire($session);
            } else {
                $engine->broadcastTimer($session);
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
