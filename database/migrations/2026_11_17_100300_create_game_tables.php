<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rooms, tables (seating), sessions (one deal), private cards,
 * submissions, results, settlement and payouts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_rooms', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('currency', 2);
            $table->unsignedBigInteger('entry_amount');
            $table->string('payout_mode', 24);
            // Basis points of the pot (500 = 5%).
            $table->unsignedSmallInteger('platform_fee_bps')->default(0);
            // Round bank: minor units paid per scoring point. Null = entry / 9.
            $table->unsignedBigInteger('point_value')->nullable();
            $table->unsignedTinyInteger('max_players')->default(4);
            $table->unsignedTinyInteger('min_players')->default(4);
            $table->unsignedSmallInteger('arrangement_seconds')->default(90);
            $table->string('tie_handling', 24)->default('split_equally');
            $table->string('timeout_policy', 16)->default('auto_arrange');
            $table->boolean('allow_foul_submission')->default(false);
            $table->string('visibility', 16)->default('public');
            $table->string('status', 16)->default('active')->index();
            $table->string('invite_code', 16)->nullable()->unique();
            // Winner-takes-all carry-forward bank (held in the escrow wallet).
            $table->unsignedBigInteger('carry_over_amount')->default(0);
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['visibility', 'status', 'currency']);
        });

        Schema::create('game_tables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_room_id')->constrained()->restrictOnDelete();
            $table->string('status', 24)->default('WAITING_FOR_PLAYERS')->index();
            $table->unsignedTinyInteger('seat_count')->default(4);
            $table->unsignedBigInteger('current_session_id')->nullable();
            $table->timestamp('full_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->index(['game_room_id', 'status']);
        });

        Schema::create('game_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_table_id')->constrained()->restrictOnDelete();
            $table->foreignId('game_room_id')->constrained()->restrictOnDelete();
            $table->string('status', 24)->index();
            // Immutable snapshot of the room configuration at game start.
            $table->json('config');
            $table->string('currency', 2);
            $table->unsignedBigInteger('pot')->default(0);
            $table->unsignedBigInteger('platform_fee')->default(0);
            // Shuffle commitment: sha256(seed_hex:deck). Seed is revealed on completion.
            $table->char('deck_commitment', 64);
            $table->text('server_seed');
            $table->boolean('seed_revealed')->default(false);
            $table->timestamp('arrangement_deadline')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('revealed_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason')->nullable();
            $table->timestamps();
        });

        Schema::create('game_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_table_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->unsignedTinyInteger('seat');
            $table->boolean('is_ready')->default(false);
            $table->boolean('is_connected')->default(true);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('seated_at')->useCurrent();
            $table->timestamps();
            $table->unique(['game_table_id', 'seat']);
            $table->unique(['game_table_id', 'user_id']);
        });

        Schema::create('wallet_holds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('game_table_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('game_session_id')->nullable()->index();
            $table->string('currency', 2);
            $table->unsignedBigInteger('amount');
            $table->string('status', 16)->default('held')->index();
            $table->foreignId('entry_transaction_id')->constrained('wallet_transactions')->restrictOnDelete();
            $table->foreignId('release_transaction_id')->nullable()->constrained('wallet_transactions')->nullOnDelete();
            $table->timestamps();
            $table->index(['user_id', 'status']);
        });

        Schema::create('game_cards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->unsignedTinyInteger('seat');
            $table->json('cards');
            $table->timestamps();
            $table->unique(['game_session_id', 'user_id']);
        });

        Schema::create('game_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->json('front');
            $table->json('middle');
            $table->json('back');
            $table->boolean('is_foul')->default(false);
            $table->boolean('is_auto')->default(false);
            $table->timestamp('submitted_at')->useCurrent();
            $table->timestamps();
            $table->unique(['game_session_id', 'user_id']);
        });

        Schema::create('game_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->unsignedTinyInteger('seat');
            $table->integer('score');
            $table->boolean('is_foul')->default(false);
            $table->unsignedTinyInteger('placement');
            $table->unsignedBigInteger('entry_amount');
            $table->unsignedBigInteger('payout_amount')->default(0);
            $table->bigInteger('net_amount')->default(0);
            $table->json('hand_labels')->nullable();
            $table->timestamps();
            $table->unique(['game_session_id', 'user_id']);
        });

        Schema::create('game_hand_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('opponent_id')->constrained('users')->restrictOnDelete();
            $table->string('position', 8);
            $table->tinyInteger('outcome');
            $table->timestamps();
            $table->unique(['game_session_id', 'user_id', 'opponent_id', 'position'], 'game_hand_results_unique');
        });

        Schema::create('game_settlements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->unique()->constrained()->restrictOnDelete();
            $table->string('status', 16)->default('pending');
            $table->string('currency', 2);
            $table->unsignedBigInteger('pot');
            $table->unsignedBigInteger('carry_in')->default(0);
            $table->unsignedBigInteger('platform_fee')->default(0);
            $table->unsignedBigInteger('payout_total')->default(0);
            $table->unsignedBigInteger('carry_out')->default(0);
            $table->json('breakdown')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->timestamps();
        });

        Schema::create('game_payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_settlement_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('amount');
            $table->foreignId('wallet_transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['game_settlement_id', 'user_id']);
        });

        Schema::create('platform_fees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->unique()->constrained()->restrictOnDelete();
            $table->string('currency', 2);
            $table->unsignedBigInteger('amount');
            $table->foreignId('wallet_transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('game_invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inviter_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('invitee_id')->constrained('users')->cascadeOnDelete();
            $table->string('status', 16)->default('pending');
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->unique(['game_room_id', 'invitee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_invitations');
        Schema::dropIfExists('platform_fees');
        Schema::dropIfExists('game_payouts');
        Schema::dropIfExists('game_settlements');
        Schema::dropIfExists('game_hand_results');
        Schema::dropIfExists('game_results');
        Schema::dropIfExists('game_submissions');
        Schema::dropIfExists('game_cards');
        Schema::dropIfExists('wallet_holds');
        Schema::dropIfExists('game_players');
        Schema::dropIfExists('game_sessions');
        Schema::dropIfExists('game_tables');
        Schema::dropIfExists('game_rooms');
    }
};
