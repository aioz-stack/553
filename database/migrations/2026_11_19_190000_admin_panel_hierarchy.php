<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Admin Panel: referral hierarchy, approval, bans, archive and Chips load logs.
 *
 * Hierarchy: Administrator → Agent → Master Agent → Silver Agent; Players can sit
 * under any of them. Every account has ONE permanent referral code (two links:
 * /register/player?ref=CODE and /register/agent?ref=CODE) and a permanent
 * sponsor (users.sponsor_id) set at registration and never changed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('referral_code', 16)->nullable()->unique()->after('username');
            // Who referred this account (permanent). Null = registered without a link / created by staff.
            $table->foreignId('sponsor_id')->nullable()->after('referral_code')->constrained('users')->nullOnDelete();
            // The account type requested at registration (applied on approval): player | agent.
            $table->string('registered_as', 8)->nullable()->after('sponsor_id');
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status_reason', 255)->nullable();
            $table->timestamp('status_changed_at')->nullable();
            $table->foreignId('status_changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('archived_at')->nullable();
            $table->index(['status', 'role']);
        });

        Schema::table('agents', function (Blueprint $table) {
            // agent | master | silver
            $table->string('level', 8)->default('agent')->after('code');
            // The upline agent (null = directly under the Administrator).
            $table->foreignId('parent_agent_id')->nullable()->after('level')->constrained('agents')->nullOnDelete();
            $table->index(['level', 'status']);
        });

        // Default commission rate per level (agent_id null + level set). Account overrides use agent_id.
        Schema::table('agent_commission_rules', function (Blueprint $table) {
            $table->string('level', 8)->nullable()->after('agent_id');
        });

        // Every Chips load, withdrawal and load request (the Load Logs).
        Schema::create('chip_loads', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 32)->unique();
            // load (sender → account) | withdraw (account → sender) | request (account asks its sponsor for Chips)
            $table->string('direction', 10);
            $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('account_id')->constrained('users')->restrictOnDelete();
            // player | agent | master | silver | admin — snapshotted when the row is written
            $table->string('account_type', 10);
            $table->unsignedBigInteger('amount');
            // completed | pending | rejected
            $table->string('status', 10)->default('completed');
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('wallet_transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note', 255)->nullable();
            $table->string('idempotency_key', 100)->nullable()->unique();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
            $table->index(['account_id', 'created_at']);
        });

        Schema::table('agent_payout_requests', function (Blueprint $table) {
            $table->foreignId('requested_by')->nullable()->after('agent_id')->constrained('users')->nullOnDelete();
            $table->string('note', 255)->nullable()->after('status');
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
        });

        // Backfill: a permanent referral code for every account; players' sponsor = their agent's user.
        foreach (DB::table('users')->whereNull('referral_code')->orderBy('id')->get(['id', 'username']) as $u) {
            DB::table('users')->where('id', $u->id)->update(['referral_code' => self::code($u->username)]);
        }
        foreach (DB::table('agent_players')->join('agents', 'agents.id', '=', 'agent_players.agent_id')->get(['agent_players.player_id', 'agents.user_id']) as $link) {
            DB::table('users')->where('id', $link->player_id)->whereNull('sponsor_id')->update(['sponsor_id' => $link->user_id]);
        }
        DB::table('users')->whereNull('approved_at')->update(['approved_at' => DB::raw('created_at')]);

        // Level defaults: Agent 50%, Master Agent 40%, Silver Agent 30% (of the eligible platform fee).
        foreach (['agent' => 5000, 'master' => 4000, 'silver' => 3000] as $level => $bps) {
            DB::table('agent_commission_rules')->insert(['agent_id' => null, 'level' => $level, 'currency' => null, 'rate_bps' => $bps, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        }

        // Payout requests used to be cash-only and are now in-platform commission withdrawals.
        DB::table('agent_payout_requests')->where('status', 'paid')->update(['status' => 'approved']);
    }

    /** A unique, readable referral code: up to 8 letters/digits of the username + 3 digits. */
    public static function code(string $username): string
    {
        $base = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $username) ?: 'USER', 0, 8));
        do {
            $code = $base.str_pad((string) random_int(0, 999), 3, '0', STR_PAD_LEFT);
        } while (DB::table('users')->where('referral_code', $code)->exists());

        return $code;
    }

    public function down(): void
    {
        Schema::table('agent_payout_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('requested_by');
            $table->dropColumn(['note', 'reviewed_at']);
        });
        Schema::dropIfExists('chip_loads');
        DB::table('agent_commission_rules')->whereNotNull('level')->delete();
        Schema::table('agent_commission_rules', fn (Blueprint $table) => $table->dropColumn('level'));
        Schema::table('agents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_agent_id');
            $table->dropIndex(['level', 'status']);
            $table->dropColumn('level');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['status', 'role']);
            $table->dropConstrainedForeignId('sponsor_id');
            $table->dropConstrainedForeignId('approved_by');
            $table->dropConstrainedForeignId('status_changed_by');
            $table->dropUnique(['referral_code']);
            $table->dropColumn(['referral_code', 'registered_as', 'approved_at', 'status_reason', 'status_changed_at', 'archived_at']);
        });
    }
};
