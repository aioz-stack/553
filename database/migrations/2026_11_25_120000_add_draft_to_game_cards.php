<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The player's latest valid arrangement while they arrange (saved by the app as they move cards).
 * When the timer runs out — online, offline or after leaving — this is what gets submitted, so a
 * player's own arrangement is never replaced by a random or reset one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_cards', function (Blueprint $table) {
            $table->json('draft')->nullable()->after('cards');
            $table->timestamp('draft_saved_at')->nullable()->after('draft');
        });
    }

    public function down(): void
    {
        Schema::table('game_cards', function (Blueprint $table) {
            $table->dropColumn(['draft', 'draft_saved_at']);
        });
    }
};
