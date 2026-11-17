<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Banker game modes (Round Bank = rotating banker, Banker Mode = fixed
 * banker), 12-round matches, per-round bets, Lucky Hands, friends, levels.
 *
 * A "match" is one game_table; every round is one game_session.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_rooms', function (Blueprint $table) {
            // classic | round_bank | banker
            $table->string('game_mode', 16)->default('classic')->after('payout_mode')->index();
            $table->unsignedTinyInteger('rounds_total')->default(12)->after('game_mode');
            // Banker modes: entry_amount is the minimum bet; max_bet null = 10 × minimum.
            $table->unsignedBigInteger('max_bet')->nullable()->after('entry_amount');
            $table->unsignedSmallInteger('betting_seconds')->default(15)->after('arrangement_seconds');
            $table->boolean('lucky_hands_enabled')->default(true)->after('allow_foul_submission');
        });

        Schema::table('game_tables', function (Blueprint $table) {
            $table->string('game_mode', 16)->default('classic')->after('status');
            $table->unsignedTinyInteger('rounds_total')->default(1)->after('game_mode');
            $table->unsignedTinyInteger('rounds_played')->default(0)->after('rounds_total');
            $table->foreignId('banker_user_id')->nullable()->after('rounds_played')->constrained('users')->nullOnDelete();
            $table->foreignId('creator_user_id')->nullable()->after('banker_user_id')->constrained('users')->nullOnDelete();
            $table->timestamp('next_round_at')->nullable()->after('full_at');
            $table->string('end_reason', 32)->nullable()->after('closed_at');
        });

        Schema::table('game_sessions', function (Blueprint $table) {
            $table->unsignedTinyInteger('round_number')->default(1)->after('game_room_id');
            $table->foreignId('banker_user_id')->nullable()->after('round_number')->constrained('users')->nullOnDelete();
            $table->timestamp('betting_deadline')->nullable()->after('seed_revealed');
            $table->index(['game_table_id', 'round_number']);
        });

        Schema::table('game_players', function (Blueprint $table) {
            $table->unsignedTinyInteger('missed_rounds')->default(0)->after('is_connected');
            $table->unsignedTinyInteger('banker_rounds')->default(0)->after('missed_rounds');
        });

        Schema::create('game_bets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('banker_user_id')->constrained('users')->restrictOnDelete();
            $table->string('currency', 2);
            $table->unsignedBigInteger('amount');
            // Worst case for each side is 2 × bet, so both reserve 2 × bet in escrow.
            $table->unsignedBigInteger('reserve');
            $table->foreignId('player_hold_id')->constrained('wallet_holds')->restrictOnDelete();
            $table->foreignId('banker_hold_id')->constrained('wallet_holds')->restrictOnDelete();
            $table->boolean('is_auto')->default(false);
            $table->timestamps();
            $table->unique(['game_session_id', 'user_id']);
        });

        Schema::table('game_submissions', function (Blueprint $table) {
            $table->string('lucky_type', 24)->nullable()->after('is_auto');
        });

        Schema::table('game_results', function (Blueprint $table) {
            $table->string('role', 8)->nullable()->after('seat'); // banker | player (null = classic)
            $table->unsignedTinyInteger('round_number')->nullable()->after('role');
            $table->unsignedBigInteger('bet_amount')->default(0)->after('entry_amount');
            $table->json('lane_results')->nullable()->after('hand_labels');
            $table->string('lucky_type', 24)->nullable()->after('lane_results');
            $table->bigInteger('lucky_bonus')->default(0)->after('lucky_type');
            $table->unsignedBigInteger('platform_fee')->default(0)->after('lucky_bonus');
            $table->index(['user_id', 'role']);
        });

        Schema::table('player_profiles', function (Blueprint $table) {
            $table->unsignedInteger('xp')->default(0)->after('total_score');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('last_seen_at')->nullable()->after('last_login_at');
        });

        Schema::create('friendships', function (Blueprint $table) {
            $table->id();
            // Requester → addressee. One row per pair (lower id first is NOT assumed).
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('friend_id')->constrained('users')->cascadeOnDelete();
            $table->string('status', 16)->default('pending'); // pending | accepted
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'friend_id']);
            $table->index(['friend_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('friendships');
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('last_seen_at'));
        Schema::table('player_profiles', fn (Blueprint $t) => $t->dropColumn('xp'));
        Schema::table('game_results', function (Blueprint $t) {
            $t->dropIndex(['user_id', 'role']);
            $t->dropColumn(['role', 'round_number', 'bet_amount', 'lane_results', 'lucky_type', 'lucky_bonus', 'platform_fee']);
        });
        Schema::table('game_submissions', fn (Blueprint $t) => $t->dropColumn('lucky_type'));
        Schema::dropIfExists('game_bets');
        Schema::table('game_players', fn (Blueprint $t) => $t->dropColumn(['missed_rounds', 'banker_rounds']));
        Schema::table('game_sessions', function (Blueprint $t) {
            $t->dropIndex(['game_table_id', 'round_number']);
            $t->dropConstrainedForeignId('banker_user_id');
            $t->dropColumn(['round_number', 'betting_deadline']);
        });
        Schema::table('game_tables', function (Blueprint $t) {
            $t->dropConstrainedForeignId('banker_user_id');
            $t->dropConstrainedForeignId('creator_user_id');
            $t->dropColumn(['game_mode', 'rounds_total', 'rounds_played', 'next_round_at', 'end_reason']);
        });
        Schema::table('game_rooms', function (Blueprint $t) {
            $t->dropIndex(['game_mode']);
            $t->dropColumn(['game_mode', 'rounds_total', 'max_bet', 'betting_seconds', 'lucky_hands_enabled']);
        });
    }
};
