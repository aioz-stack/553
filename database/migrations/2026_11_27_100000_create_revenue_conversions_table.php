<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Self Convert Revenue to Chips (Admin / Incorporator / Master Agent Overview): one row per
 * conversion of the account's whole Revenue wallet into its Chips wallet. Amounts are minor units
 * (cents). Rows are never edited after completion; the ledger entry is the source of truth.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('revenue_conversions', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 40)->unique();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('role', 20);
            $table->string('agent_level', 20)->nullable();
            $table->unsignedBigInteger('revenue_amount');
            // Chips per 1 Revenue, in basis points (10000 = 1:1).
            $table->unsignedInteger('rate_bps');
            $table->unsignedBigInteger('chips_amount');
            $table->unsignedBigInteger('revenue_before');
            $table->unsignedBigInteger('revenue_after');
            $table->unsignedBigInteger('chips_before');
            $table->unsignedBigInteger('chips_after');
            $table->string('status', 20);
            $table->string('idempotency_key', 120);
            $table->foreignId('wallet_transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('revenue_conversions');
    }
};
