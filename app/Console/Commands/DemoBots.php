<?php

namespace App\Console\Commands;

use App\Enums\GameStatus;
use App\Enums\Role;
use App\Enums\TableStatus;
use App\Exceptions\BusinessRuleException;
use App\Game\AutoArranger;
use App\Game\LuckyHand;
use App\Models\GameBet;
use App\Models\GameCard;
use App\Models\GamePlayer;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\GameSubmission;
use App\Models\GameTable;
use App\Models\User;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use App\Services\Game\TableService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * LOCAL DEVELOPMENT ONLY: demo players ("demo1"…) sit at a table and play
 * through the real services — heartbeat, ready, bet, declare Lucky, submit
 * the server's auto-arrangement — so one person can test a full 12-round
 * banker match. Bots act like any client; no shortcuts around game rules.
 */
#[Signature('pusoy:bots {room : Room id or slug} {--players=3 : Demo players to seat} {--minutes=30 : Stop after this long} {--skip= : Comma-separated usernames to leave out (e.g. the demo account you play as)}')]
#[Description('[dev] Seat demo bots at a room and let them play until the match ends')]
class DemoBots extends Command
{
    public function handle(TableService $tables, BankerMatchService $match, GameEngine $engine): int
    {
        if (! app()->isLocal()) {
            $this->error('This command only runs when APP_ENV=local.');

            return self::FAILURE;
        }

        $room = GameRoom::query()->where('id', $this->argument('room'))->orWhere('slug', $this->argument('room'))->firstOrFail();
        $bots = User::query()->where('role', Role::Player->value)->where('username', 'like', 'demo%')->orderBy('id')->get()
            ->reject(fn (User $u) => in_array($u->username, array_filter(explode(',', (string) $this->option('skip'))), true))
            ->reject(fn (User $u) => $tables->activeSeat($u) && $tables->activeSeat($u)->table->game_room_id !== $room->id)
            ->take((int) $this->option('players'))->values();

        foreach ($bots as $bot) {
            if (! $tables->activeSeat($bot)) {
                $seat = $tables->join($bot, $room);
                $this->info("{$bot->username} sat at table #{$seat->game_table_id} seat {$seat->seat}");
            }
        }

        $until = now()->addMinutes((int) $this->option('minutes'));
        $actAt = [];

        while (now()->lt($until)) {
            $seats = GamePlayer::query()->with('table')->whereIn('user_id', $bots->pluck('id'))
                ->whereHas('table', fn ($q) => $q->where('status', '!=', TableStatus::Closed->value))->get();

            if ($seats->isEmpty()) {
                $this->info('Match over — bots are done.');

                return self::SUCCESS;
            }

            foreach ($seats as $seat) {
                $bot = $bots->firstWhere('id', $seat->user_id);
                $table = GameTable::query()->find($seat->game_table_id);

                try {
                    $tables->heartbeat($bot, $table);

                    if (in_array($table->status, [TableStatus::WaitingForPlayers, TableStatus::Ready], true) && ! $seat->is_ready) {
                        $tables->setReady($bot, $table, true);
                        $this->line("{$bot->username} is ready");
                    }

                    $session = $table->current_session_id ? GameSession::query()->find($table->current_session_id) : null;

                    if ($session === null) {
                        continue;
                    }

                    $key = "{$session->id}:{$bot->id}:{$session->status->value}";
                    $actAt[$key] ??= now()->addSeconds(random_int(2, 6));

                    if (now()->lt($actAt[$key])) {
                        continue;
                    }

                    if ($session->status === GameStatus::Betting && in_array($bot->id, $session->config['participants'] ?? [], true)
                        && ! GameBet::query()->where('game_session_id', $session->id)->where('user_id', $bot->id)->exists()) {
                        $amount = $session->config['min_bet'] * random_int(1, 3);
                        $match->placeBet($bot, $session, min($amount, $session->config['max_bet']));
                        $this->line("{$bot->username} bet round {$session->round_number}");
                    }

                    if ($session->status === GameStatus::Arranging
                        && ! GameSubmission::query()->where('game_session_id', $session->id)->where('user_id', $bot->id)->exists()
                        && ($cards = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $bot->id)->value('cards'))) {
                        if ($session->isBankerRound() && LuckyHand::detect($cards)) {
                            $match->declareLucky($bot, $session, $engine);
                            $this->line("{$bot->username} declared LUCKY");
                        } else {
                            $a = AutoArranger::arrange($cards);
                            $engine->submit($bot, $session, $a->front, $a->middle, $a->back);
                            $this->line("{$bot->username} submitted round {$session->round_number}");
                        }
                    }
                } catch (BusinessRuleException $e) {
                    $this->warn("{$bot->username}: {$e->getMessage()}");
                }
            }

            usleep(1_000_000);
        }

        return self::SUCCESS;
    }
}
