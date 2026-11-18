<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Multiplayer lobbies (player-created 4-seat diamond rooms): a public Lobby ID,
 * an optional hashed password (set = private lobby), the minimum diamond balance
 * needed to enter, and owner-started games (the owner presses Start once four
 * players are seated and ready). A lobby is a game_room with lobby_code set.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_rooms', function (Blueprint $table) {
            $table->string('lobby_code', 12)->nullable()->unique()->after('invite_code');
            $table->string('lobby_password')->nullable()->after('lobby_code');
            $table->unsignedBigInteger('min_entry')->nullable()->after('lobby_password');
            $table->boolean('owner_starts')->default(false)->after('min_entry');
            $table->index(['lobby_code', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('game_rooms', function (Blueprint $table) {
            $table->dropIndex(['lobby_code', 'status']);
            $table->dropUnique(['lobby_code']);
            $table->dropColumn(['lobby_code', 'lobby_password', 'min_entry', 'owner_starts']);
        });
    }
};
