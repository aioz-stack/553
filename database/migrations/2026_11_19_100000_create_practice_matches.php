<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Single Player Round Bank: a 12-round match, the player against one bot.
 * The banker alternates (odd rounds: player, even rounds: bot); every round is
 * a practice_games row linked to its match.
 *
 * Gold (CP) only moves when the cp_wagering feature flag was on when the
 * match started (`wagering`); then each round reserves 2 × bet from the player
 * and from the house (platform CP wallet) into escrow and settles from it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('practice_matches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('tier', 32);
            // active | completed | abandoned
            $table->string('status', 16)->default('active');
            $table->unsignedTinyInteger('rounds_total')->default(12);
            $table->unsignedTinyInteger('rounds_played')->default(0);
            $table->boolean('wagering')->default(false);
            // Player's running result in minor units (+ won from the house, - lost).
            $table->bigInteger('player_net')->default(0);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });

        Schema::table('practice_games', function (Blueprint $table) {
            $table->foreignId('practice_match_id')->nullable()->after('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('round_number')->nullable()->after('practice_match_id');
            // player | bot
            $table->string('banker', 8)->nullable()->after('round_number');
            // Escrow reserves in minor units; none | held | settled | released
            $table->unsignedBigInteger('player_reserve')->default(0)->after('bet');
            $table->unsignedBigInteger('house_reserve')->default(0)->after('player_reserve');
            $table->string('reserve_status', 10)->default('none')->after('house_reserve');
            $table->unique(['practice_match_id', 'round_number']);
        });
    }

    public function down(): void
    {
        Schema::table('practice_games', function (Blueprint $table) {
            $table->dropUnique(['practice_match_id', 'round_number']);
            $table->dropConstrainedForeignId('practice_match_id');
            $table->dropColumn(['round_number', 'banker', 'player_reserve', 'house_reserve', 'reserve_status']);
        });
        Schema::dropIfExists('practice_matches');
    }
};
