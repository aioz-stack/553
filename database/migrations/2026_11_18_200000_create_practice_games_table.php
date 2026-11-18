<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Single Player practice: one player against three server bots.
 *
 * Free play with no currency at all — nothing here touches wallets, the
 * ledger, XP, leaderboards or commissions. The deck, the bots' hands and
 * all scoring stay on the server; bots' cards are hidden until the player
 * submits.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('practice_games', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // arranging | completed | abandoned
            $table->string('status', 16)->default('arranging');
            $table->string('server_seed', 64);
            $table->string('deck_commitment', 64);
            // seat (1 = player, 2..4 = bots) => 13 cards
            $table->json('hands');
            // seat => {front, middle, back}; bots are arranged at deal time
            $table->json('arrangements');
            // seat => total score, placement, fouls, comparisons (set on completion)
            $table->json('results')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_games');
    }
};
