<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Single Player difficulty selection: the tier and bet the player picked,
 * plus a client request id so a double tap / retry of "Continue" returns the
 * same deal instead of starting a second one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('practice_games', function (Blueprint $table) {
            $table->string('tier', 32)->default('beginner')->after('status');
            // Display points (never charged: Single Player moves no currency).
            $table->unsignedBigInteger('bet')->default(0)->after('tier');
            $table->string('request_id', 64)->nullable()->after('bet');
            $table->unique(['user_id', 'request_id']);
        });
    }

    public function down(): void
    {
        Schema::table('practice_games', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'request_id']);
            $table->dropColumn(['tier', 'bet', 'request_id']);
        });
    }
};
