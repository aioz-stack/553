<?php

namespace App\Console\Commands;

use App\Enums\GameStatus;
use App\Enums\Role;
use App\Game\AutoArranger;
use App\Models\GameCard;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\User;
use App\Services\Game\GameEngine;
use App\Services\Game\TableService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * LOCAL DEVELOPMENT ONLY: seat demo players next to a real player so one
 * person can test a full four-player game. Demo players ready up and, once
 * cards are dealt, submit the server's auto-arrangement.
 */
#[Signature('pusoy:fill-table {room : Room id or slug} {--submit : Submit auto-arrangements for demo players in the running game}')]
#[Description('[dev] Fill the open table in a room with seeded demo players')]
class FillTable extends Command
{
    public function handle(TableService $tables, GameEngine $engine): int
    {
        if (! app()->isLocal()) {
            $this->error('This command only runs when APP_ENV=local.');

            return self::FAILURE;
        }

        $room = GameRoom::query()->where('id', $this->argument('room'))->orWhere('slug', $this->argument('room'))->firstOrFail();

        if ($this->option('submit')) {
            return $this->submitDemo($room, $engine);
        }

        $demo = User::query()->where('role', Role::Player->value)->where('username', 'like', 'demo%')->orderBy('id')->get();

        foreach ($demo as $user) {
            if ($tables->activeSeat($user)) {
                continue;
            }

            $seat = $tables->join($user, $room);
            $this->info("Seated {$user->username} at table #{$seat->game_table_id} seat {$seat->seat}");

            $tables->setReady($user, $seat->table, true);

            if ($seat->table->fresh()->players()->count() >= 4) {
                break;
            }
        }

        return self::SUCCESS;
    }

    private function submitDemo(GameRoom $room, GameEngine $engine): int
    {
        $session = GameSession::query()->where('game_room_id', $room->id)->where('status', GameStatus::Arranging->value)->latest('id')->first();

        if ($session === null) {
            $this->warn('No game is currently arranging in this room.');

            return self::SUCCESS;
        }

        foreach (GameCard::query()->with('user')->where('game_session_id', $session->id)->get() as $card) {
            if (! str_starts_with($card->user->username, 'demo') || $session->submissions()->where('user_id', $card->user_id)->exists()) {
                continue;
            }

            $a = AutoArranger::arrange($card->cards);
            $engine->submit($card->user, $session, $a->front, $a->middle, $a->back);
            $this->info("{$card->user->username} submitted.");
        }

        return self::SUCCESS;
    }
}
