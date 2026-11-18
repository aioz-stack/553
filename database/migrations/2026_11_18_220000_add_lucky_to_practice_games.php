<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Single Player "Declared Luck": which special hand the player declared
 * (three_flushes / no_face_cards / six_pairs) and when. A practice game can
 * be declared at most once (it completes on declaration).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('practice_games', function (Blueprint $table) {
            $table->string('lucky_type', 32)->nullable()->after('bet');
            $table->timestamp('lucky_declared_at')->nullable()->after('lucky_type');
        });
    }

    public function down(): void
    {
        Schema::table('practice_games', function (Blueprint $table) {
            $table->dropColumn(['lucky_type', 'lucky_declared_at']);
        });
    }
};
