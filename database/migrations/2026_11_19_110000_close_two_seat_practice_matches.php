<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Single Player moved from 1 bot to 3 bots (four seats, banker = seat number).
 * Close any unfinished match started under the two-seat format (banker stored
 * as 'player' / 'bot'); only free-play matches existed (no Gold reserves).
 */
return new class extends Migration
{
    public function up(): void
    {
        $legacy = DB::table('practice_games')->whereIn('banker', ['player', 'bot'])->distinct()->pluck('practice_match_id');

        DB::table('practice_games')->whereIn('practice_match_id', $legacy)->where('status', 'arranging')
            ->where('reserve_status', '!=', 'held')->update(['status' => 'abandoned']);
        DB::table('practice_matches')->whereIn('id', $legacy)->where('status', 'active')->where('wagering', false)
            ->update(['status' => 'abandoned']);
    }

    public function down(): void
    {
        // Nothing to restore.
    }
};
