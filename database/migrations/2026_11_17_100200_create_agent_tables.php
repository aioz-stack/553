<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Agents, their players, referral codes and the commission system.
 * Agent allocation and commission balances live in `wallets`
 * (type allocation / commission), never mixed with each other.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->restrictOnDelete();
            $table->string('code', 16)->unique();
            $table->string('status', 16)->default('active');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // A player belongs to at most one agent (unique player_id).
        Schema::create('agent_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agent_id')->constrained()->restrictOnDelete();
            $table->foreignId('player_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('referral_code_id')->nullable();
            $table->timestamp('assigned_at')->useCurrent();
            $table->index(['agent_id', 'assigned_at']);
        });

        Schema::create('agent_referral_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agent_id')->constrained()->cascadeOnDelete();
            $table->string('code', 24)->unique();
            $table->unsignedInteger('max_uses')->nullable();
            $table->unsignedInteger('uses')->default(0);
            $table->timestamp('expires_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Commission rates are set by Super Admin. agent_id null = platform default.
        Schema::create('agent_commission_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agent_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('currency', 2)->nullable();
            // Basis points of the eligible platform fee (4000 = 40%).
            $table->unsignedSmallInteger('rate_bps');
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['agent_id', 'is_active']);
        });

        Schema::create('agent_commissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agent_id')->constrained()->restrictOnDelete();
            $table->foreignId('player_id')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('game_session_id');
            $table->foreignId('commission_rule_id')->nullable()->constrained('agent_commission_rules')->nullOnDelete();
            $table->string('currency', 2);
            // Snapshot of the calculation at the time it was made.
            $table->unsignedBigInteger('fee_basis');
            $table->unsignedSmallInteger('rate_bps');
            $table->unsignedBigInteger('amount');
            $table->string('status', 16)->default('pending')->index();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('payment_transaction_id')->nullable()->constrained('wallet_transactions')->nullOnDelete();
            $table->foreignId('reversal_transaction_id')->nullable()->constrained('wallet_transactions')->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamps();
            $table->unique(['agent_id', 'game_session_id', 'player_id']);
            $table->index('game_session_id');
        });

        // Cash payout requests. Endpoint is blocked unless the relevant
        // feature flag is enabled after regulatory approval.
        Schema::create('agent_payout_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agent_id')->constrained()->restrictOnDelete();
            $table->string('currency', 2);
            $table->unsignedBigInteger('amount');
            $table->string('status', 16)->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('wallet_transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_payout_requests');
        Schema::dropIfExists('agent_commissions');
        Schema::dropIfExists('agent_commission_rules');
        Schema::dropIfExists('agent_referral_codes');
        Schema::dropIfExists('agent_players');
        Schema::dropIfExists('agents');
    }
};
