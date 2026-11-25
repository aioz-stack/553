<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lobby entry tiers (100 / 500 / 1,000 Chips) with fixed bets and a Keys entry fee, the bet each
 * player selects when joining, and pausing a Round Bank match when nobody can bank.
 *
 *  - game_rooms.bet_options: the tier's allowed bets (minor units), stored on the lobby so later
 *    config changes never alter an existing lobby; entry_keys: Keys each player pays (whole Keys).
 *  - game_players.selected_bet: the bet the player chose (minor units); they must hold 2× it.
 *  - game_tables.paused_at / pause_reason: a match waiting for an eligible banker.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_rooms', function (Blueprint $table) {
            $table->json('bet_options')->nullable()->after('min_entry');
            $table->unsignedInteger('entry_keys')->default(0)->after('bet_options');
        });
        Schema::table('game_players', function (Blueprint $table) {
            $table->unsignedBigInteger('selected_bet')->nullable()->after('seat');
        });
        Schema::table('game_tables', function (Blueprint $table) {
            $table->timestamp('paused_at')->nullable()->after('next_round_at');
            $table->string('pause_reason', 40)->nullable()->after('paused_at');
        });
    }

    public function down(): void
    {
        Schema::table('game_tables', fn (Blueprint $t) => $t->dropColumn(['paused_at', 'pause_reason']));
        Schema::table('game_players', fn (Blueprint $t) => $t->dropColumn('selected_bet'));
        Schema::table('game_rooms', fn (Blueprint $t) => $t->dropColumn(['bet_options', 'entry_keys']));
    }
};
