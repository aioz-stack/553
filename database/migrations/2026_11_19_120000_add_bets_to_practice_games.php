<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Round Bank betting: the banker places no bet; every other seat places its
 * own. `bets` is seat => bet (Gold points) for the non-banker seats.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('practice_games', function (Blueprint $table) {
            $table->json('bets')->nullable()->after('bet');
        });
    }

    public function down(): void
    {
        Schema::table('practice_games', function (Blueprint $table) {
            $table->dropColumn('bets');
        });
    }
};
