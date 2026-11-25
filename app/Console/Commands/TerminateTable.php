<?php

namespace App\Console\Commands;

use App\Enums\GameStatus;
use App\Enums\TableStatus;
use App\Events\Game\GameEvents;
use App\Events\Game\TableEvent;
use App\Events\Game\UserEvent;
use App\Models\GamePlayer;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Services\Audit\AuditLogger;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Force a table's game to end and send its players home (operations / support).
 *
 *  - A round in progress is cancelled through GameEngine::cancel: every Chip held for it goes back to
 *    its owner (ledger refunds, once per hold) — nobody wins or loses that round; rounds already
 *    settled stay settled.
 *  - The match ends with end_reason `terminated_by_admin`: the lobby closes, nobody is seated any
 *    more, and the players' apps show a notice and go to Game Home.
 *  - The Keys entry fee is NOT refunded (balances stay exactly as they are) unless --refund-keys.
 *  - Audited (`table.terminated`).
 *
 *   php artisan pusoy:terminate-table 22
 */
#[Signature('pusoy:terminate-table {table : Table id} {--refund-keys : Also refund the lobby Keys entry fee when no round was completed}')]
#[Description('End a table\'s game now: held Chips back to their owners, players sent to Game Home')]
class TerminateTable extends Command
{
    public const REASON = 'terminated_by_admin';

    public function handle(GameEngine $engine, BankerMatchService $match): int
    {
        $table = GameTable::query()->with('room')->find((int) $this->argument('table'));
        if (! $table) {
            $this->error('No such table.');

            return self::FAILURE;
        }
        if ($table->status === TableStatus::Closed) {
            $this->warn("Table {$table->id} is already closed ({$table->end_reason}). Nothing to do.");

            return self::SUCCESS;
        }

        $players = GamePlayer::query()->where('game_table_id', $table->id)->pluck('user_id')->all();
        config(['pusoy.lobby.refund_keys_if_no_round_completed' => (bool) $this->option('refund-keys')]);

        $session = $table->current_session_id ? GameSession::query()->find($table->current_session_id) : null;
        if ($session && ! $session->status->isFinal()) {
            // Refunds every hold of the round, then ends the match with our reason.
            $engine->cancel($session, null, self::REASON, self::REASON);
        } else {
            DB::transaction(fn () => $match->end(GameTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail(), self::REASON));
        }

        $table->refresh();
        if ($table->status !== TableStatus::Closed) {
            // Non-banker (classic) tables: closed by cancel() without a reason; record it.
            $table->forceFill(['status' => TableStatus::Closed, 'closed_at' => now(), 'end_reason' => self::REASON])->save();
            event(new TableEvent($table->id, GameEvents::MATCH_COMPLETED, ['reason' => self::REASON]));
        }

        // Tell every player at once (their app goes to Game Home).
        foreach ($players as $userId) {
            event(new UserEvent((int) $userId, 'table.terminated', ['table_id' => $table->id, 'message' => 'This game was ended by the administrator.']));
        }
        AuditLogger::log(null, 'table.terminated', $table, null, ['players' => $players, 'session_id' => $session?->id, 'refund_keys' => (bool) $this->option('refund-keys')]);

        $this->info("Table {$table->id} terminated ({$table->end_reason}). Players: ".count($players).'.');

        return self::SUCCESS;
    }
}
