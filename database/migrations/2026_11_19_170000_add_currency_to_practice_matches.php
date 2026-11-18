<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Single Player Gold Wallet: every match now settles in Gold (GD, free-play).
 * Existing matches were CP (cash, only moved with features.cp_wagering), so
 * they keep 'CP' and any held reserves release back to CP.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('practice_matches', function (Blueprint $table) {
            $table->string('currency', 2)->default('GD')->after('wagering');
        });

        DB::table('practice_matches')->update(['currency' => 'CP']);
    }

    public function down(): void
    {
        Schema::table('practice_matches', function (Blueprint $table) {
            $table->dropColumn('currency');
        });
    }
};
