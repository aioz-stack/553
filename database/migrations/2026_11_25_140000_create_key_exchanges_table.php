<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shop: Keys → Gold exchange log. One row per exchange attempt with the package, the Keys
 * deducted, the Gold received (minor units), the two ledger transactions and the status.
 * Completed exchanges are final; rows are never edited afterwards.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('key_exchanges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('package', 16);
            $table->unsignedBigInteger('keys_amount');
            $table->unsignedBigInteger('gold_amount');
            $table->string('status', 16)->index(); // completed | rejected
            $table->string('failure_reason')->nullable();
            $table->string('idempotency_key', 64);
            $table->foreignId('keys_transaction_id')->nullable()->constrained('wallet_transactions')->nullOnDelete();
            $table->foreignId('gold_transaction_id')->nullable()->constrained('wallet_transactions')->nullOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('key_exchanges');
    }
};
