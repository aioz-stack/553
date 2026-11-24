<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Shop: Keys now exchange for Chips (was Gold). The reward columns become currency-neutral and
 * every row records which currency it paid, so earlier Gold exchanges stay correct in history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('key_exchanges', function (Blueprint $table) {
            $table->renameColumn('gold_amount', 'reward_amount');
            $table->renameColumn('gold_transaction_id', 'reward_transaction_id');
        });
        Schema::table('key_exchanges', function (Blueprint $table) {
            $table->string('reward_currency', 2)->default('CH')->after('reward_amount');
        });
        // Exchanges made before this change paid Gold.
        DB::table('key_exchanges')->update(['reward_currency' => 'GD']);
    }

    public function down(): void
    {
        Schema::table('key_exchanges', function (Blueprint $table) {
            $table->dropColumn('reward_currency');
        });
        Schema::table('key_exchanges', function (Blueprint $table) {
            $table->renameColumn('reward_amount', 'gold_amount');
            $table->renameColumn('reward_transaction_id', 'gold_transaction_id');
        });
    }
};
