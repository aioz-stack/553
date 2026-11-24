<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Silver Agent is removed. Hierarchy: Administrator → Incorporator → Master Agent → Player.
 *
 * Every Silver Agent account becomes a Master Agent under the Incorporator above its old Master
 * Agent. Nothing else moves: same login, same wallets and balances, same transaction and
 * commission history, and the same players (agent_players is untouched). The old upline is
 * written to the audit log. The Silver level commission rule is deactivated (kept for history).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            $silvers = DB::table('agents')->where('level', 'silver')->lockForUpdate()->get();

            foreach ($silvers as $silver) {
                $oldParent = $silver->parent_agent_id ? DB::table('agents')->where('id', $silver->parent_agent_id)->first() : null;
                // The Incorporator above the old Master Agent (or none).
                $newParentId = $oldParent?->parent_agent_id;
                $newParentUserId = $newParentId ? DB::table('agents')->where('id', $newParentId)->value('user_id') : null;
                $oldSponsorId = DB::table('users')->where('id', $silver->user_id)->value('sponsor_id');

                DB::table('agents')->where('id', $silver->id)->update([
                    'level' => 'master',
                    'parent_agent_id' => $newParentId,
                    'updated_at' => now(),
                ]);

                if ($newParentUserId) {
                    DB::table('users')->where('id', $silver->user_id)->update(['sponsor_id' => $newParentUserId, 'updated_at' => now()]);
                }

                DB::table('audit_logs')->insert([
                    'actor_id' => null,
                    'action' => 'agent.silver_level_removed',
                    'subject_type' => 'App\\Models\\User',
                    'subject_id' => $silver->user_id,
                    'old_values' => json_encode(['level' => 'silver', 'parent_agent_id' => $silver->parent_agent_id, 'sponsor_id' => $oldSponsorId]),
                    'new_values' => json_encode(['level' => 'master', 'parent_agent_id' => $newParentId, 'sponsor_id' => $newParentUserId ?? $oldSponsorId]),
                    'created_at' => now(),
                ]);
            }

            DB::table('agent_commission_rules')->whereNull('agent_id')->where('level', 'silver')->update(['is_active' => false, 'updated_at' => now()]);
        });
    }

    public function down(): void
    {
        // Not reversible: the accounts keep working as Master Agents; the audit log has the old upline.
    }
};
