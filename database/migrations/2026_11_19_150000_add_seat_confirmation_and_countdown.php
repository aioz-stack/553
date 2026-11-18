<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Choose Your Seat (multiplayer lobbies): a joined player holds one seat (Reserved) until they
 * confirm it (`seat_confirmed`); once all four have confirmed and pressed Start, the server runs a
 * 3-second countdown (`countdown_ends_at`) and then starts the match.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_players', function (Blueprint $table) {
            $table->boolean('seat_confirmed')->default(false)->after('is_ready');
        });
        Schema::table('game_tables', function (Blueprint $table) {
            $table->timestamp('countdown_ends_at', 3)->nullable()->after('full_at');
        });
    }

    public function down(): void
    {
        Schema::table('game_players', fn (Blueprint $t) => $t->dropColumn('seat_confirmed'));
        Schema::table('game_tables', fn (Blueprint $t) => $t->dropColumn('countdown_ends_at'));
    }
};
