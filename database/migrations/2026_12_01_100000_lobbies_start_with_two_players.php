<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Multiplayer lobbies start with at least 2 players (LobbyService::MIN_PLAYERS). Lobbies created
 * before required 4 (game_rooms.min_players = 4); every lobby room gets 2. Matches in progress are
 * not affected (the minimum is only checked when a match starts).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('game_rooms')->whereNotNull('lobby_code')->where('min_players', '>', 2)->update(['min_players' => 2]);
    }

    public function down(): void
    {
        DB::table('game_rooms')->whereNotNull('lobby_code')->where('min_players', 2)->update(['min_players' => 4]);
    }
};
