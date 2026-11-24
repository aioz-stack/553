<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Shop direction changes to Chips → Keys (5 Chips = 1 Key), and the Chips paid are shared with
 * the player's hierarchy (Admin / Incorporator / Master Agent) into their Chips wallets.
 *
 * key_exchanges gets the direction, the Chips paid, the player's username, the direct upline,
 * the hierarchy snapshot and the share scenario. key_exchange_shares holds one row per recipient
 * (role, percent, amount, Chips wallet credited, ledger transaction). Earlier Keys → Gold/Chips
 * exchanges are kept as they were (direction 'keys_out').
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('key_exchanges', function (Blueprint $table) {
            $table->string('direction', 16)->default('chips_to_keys')->after('package');
            $table->unsignedBigInteger('chips_amount')->default(0)->after('direction');
            $table->string('player_username')->nullable()->after('user_id');
            $table->foreignId('upline_user_id')->nullable()->after('player_username')->constrained('users')->nullOnDelete();
            $table->string('scenario', 24)->nullable()->after('upline_user_id');
            $table->json('hierarchy')->nullable()->after('scenario');
            $table->foreignId('chips_transaction_id')->nullable()->after('keys_transaction_id')->constrained('wallet_transactions')->nullOnDelete();
        });
        // Earlier exchanges paid out Keys for Gold / Chips.
        DB::table('key_exchanges')->update(['direction' => 'keys_out']);

        Schema::create('key_exchange_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('key_exchange_id')->constrained()->cascadeOnDelete();
            $table->string('role', 16); // admin | incorporator | master | platform
            $table->foreignId('recipient_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedSmallInteger('percent_bps');
            $table->unsignedBigInteger('amount');
            $table->foreignId('wallet_id')->constrained('wallets');
            $table->foreignId('wallet_transaction_id')->nullable()->constrained('wallet_transactions')->nullOnDelete();
            $table->timestamps();
            $table->unique(['key_exchange_id', 'role']);
            $table->index('recipient_user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('key_exchange_shares');
        Schema::table('key_exchanges', function (Blueprint $table) {
            $table->dropConstrainedForeignId('upline_user_id');
            $table->dropConstrainedForeignId('chips_transaction_id');
            $table->dropColumn(['direction', 'chips_amount', 'player_username', 'scenario', 'hierarchy']);
        });
    }
};
