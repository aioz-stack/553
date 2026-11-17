<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Unified wallet + immutable ledger.
 *
 * All balances are unsigned BIGINT minor units (1 point = 100). A wallet is
 * identified by (user, currency, type). Agent "allocation" and "commission"
 * balances are wallets of type allocation / commission — there is no
 * separate agent wallet system. Platform and escrow wallets are system
 * wallets (user_id null, unique system_key).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('system_key', 32)->nullable()->unique();
            $table->string('currency', 2);
            $table->string('type', 16);
            $table->unsignedBigInteger('balance')->default(0);
            $table->boolean('is_frozen')->default(false);
            $table->foreignId('frozen_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('frozen_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'currency', 'type']);
            $table->index(['type', 'currency']);
        });

        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 40)->unique();
            $table->string('idempotency_key', 191)->nullable()->unique();
            $table->string('type', 32)->index();
            $table->string('currency', 2)->index();
            // Null source = issuance by Super Admin; null destination = burn.
            $table->foreignId('source_wallet_id')->nullable()->constrained('wallets')->restrictOnDelete();
            $table->foreignId('destination_wallet_id')->nullable()->constrained('wallets')->restrictOnDelete();
            $table->unsignedBigInteger('amount');
            $table->unsignedBigInteger('source_balance_before')->nullable();
            $table->unsignedBigInteger('source_balance_after')->nullable();
            $table->unsignedBigInteger('destination_balance_before')->nullable();
            $table->unsignedBigInteger('destination_balance_after')->nullable();
            $table->string('status', 16)->default('completed');
            $table->string('reason', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('related_player_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('related_agent_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('game_session_id')->nullable()->index();
            $table->foreignId('reversal_of_id')->nullable()->unique()->constrained('wallet_transactions')->restrictOnDelete();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
            $table->index(['source_wallet_id', 'created_at']);
            $table->index(['destination_wallet_id', 'created_at']);
        });

        // Records which point allocations were made (actor -> recipient). The
        // money movement itself is the linked wallet transaction.
        Schema::create('wallet_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_transaction_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('allocator_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('recipient_id')->constrained('users')->restrictOnDelete();
            $table->string('currency', 2);
            $table->string('target_type', 16);
            $table->unsignedBigInteger('amount');
            $table->string('reason', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['allocator_id', 'created_at']);
            $table->index(['recipient_id', 'created_at']);
        });

        Schema::create('wallet_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_transaction_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('wallet_id')->constrained()->restrictOnDelete();
            $table->string('direction', 8);
            $table->unsignedBigInteger('amount');
            $table->string('reason', 255);
            $table->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_adjustments');
        Schema::dropIfExists('wallet_allocations');
        Schema::dropIfExists('wallet_transactions');
        Schema::dropIfExists('wallets');
    }
};
