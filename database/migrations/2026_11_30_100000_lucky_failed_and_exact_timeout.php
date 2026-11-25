<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Card Submission, Misarrangement Penalty & Lucky Hand Rules (Multiplayer): a Lucky Hand
 * declaration that does not qualify is accepted and penalised (2 × bet), so the submission and
 * the round result record it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_submissions', function (Blueprint $table) {
            $table->boolean('lucky_failed')->default(false)->after('lucky_type');
        });
        Schema::table('game_results', function (Blueprint $table) {
            $table->boolean('lucky_failed')->default(false)->after('lucky_bonus');
        });
    }

    public function down(): void
    {
        Schema::table('game_submissions', fn (Blueprint $table) => $table->dropColumn('lucky_failed'));
        Schema::table('game_results', fn (Blueprint $table) => $table->dropColumn('lucky_failed'));
    }
};
