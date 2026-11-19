<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Gold & Chips only. The game keeps exactly two currencies:
 *   GD — Gold, Single Player only;  CH — Chips, Multiplayer only.
 *
 * - Gold Points (GP) are retired: every GP balance is moved into the owner's Gold
 *   wallet 1:1 with an issuing ledger row (OUT_OF_GOLD_REWARD), then GP is deleted.
 * - Cash Points (CP) and Virtual Coins (VC) are deleted everywhere: wallets (player,
 *   allocation, commission, escrow, platform), their ledger rows, holds, allocations,
 *   adjustments, platform fees, payouts, commissions and administrator limits.
 *   Chips start at zero (an administrator allocates them).
 * - Room, lobby, session snapshot and commission-rule configuration move to CH;
 *   CP-only rooms are removed. Single Player matches recorded under CP (never
 *   wagered: the CP flag was off) are relabelled GD.
 *
 * Destructive by design (the owner chose it): back up first. Down is a no-op;
 * restore the backup to go back.
 */
return new class extends Migration
{
    private const OLD = ['CP', 'VC', 'GP'];

    public function up(): void
    {
        DB::transaction(function () {
            $this->goldPointsIntoGold();

            $oldWallets = DB::table('wallets')->whereIn('currency', self::OLD)->pluck('id');
            $oldTx = DB::table('wallet_transactions')->whereIn('currency', self::OLD)->pluck('id');
            $oldHolds = DB::table('wallet_holds')->whereIn('wallet_id', $oldWallets)->orWhereIn('currency', self::OLD)->pluck('id');

            DB::table('game_bets')->whereIn('banker_hold_id', $oldHolds)->orWhereIn('player_hold_id', $oldHolds)->delete();
            DB::table('wallet_adjustments')->whereIn('wallet_id', $oldWallets)->orWhereIn('wallet_transaction_id', $oldTx)->delete();
            DB::table('wallet_allocations')->whereIn('currency', self::OLD)->orWhereIn('wallet_transaction_id', $oldTx)->delete();
            DB::table('platform_fees')->whereIn('currency', self::OLD)->orWhereIn('wallet_transaction_id', $oldTx)->delete();
            DB::table('game_payouts')->whereIn('wallet_transaction_id', $oldTx)->delete();
            DB::table('agent_payout_requests')->whereIn('currency', self::OLD)->orWhereIn('wallet_transaction_id', $oldTx)->delete();
            DB::table('agent_commissions')->whereIn('currency', self::OLD)->orWhereIn('payment_transaction_id', $oldTx)->orWhereIn('reversal_transaction_id', $oldTx)->delete();
            DB::table('game_settlements')->whereIn('currency', self::OLD)->delete();
            DB::table('wallet_holds')->whereIn('id', $oldHolds)->delete();
            // Reversals point at their originals: unlink, then delete the old ledger.
            DB::table('wallet_transactions')->whereIn('id', $oldTx)->update(['reversal_of_id' => null]);
            DB::table('wallet_transactions')->whereIn('id', $oldTx)->delete();
            DB::table('wallets')->whereIn('id', $oldWallets)->delete();

            DB::table('administrator_limits')->whereIn('currency', ['CP', 'GP'])->delete();
            DB::table('administrator_limits')->where('currency', 'VC')->update(['currency' => 'CH']);
            DB::table('agent_commission_rules')->whereIn('currency', ['CP', 'GP'])->delete();
            DB::table('agent_commission_rules')->where('currency', 'VC')->update(['currency' => 'CH']);

            // Rooms and lobbies play for Chips. CP rooms are removed (or, if games reference them, moved to Chips).
            foreach (DB::table('game_rooms')->where('currency', 'CP')->pluck('id') as $roomId) {
                $used = DB::table('game_tables')->where('game_room_id', $roomId)->exists();
                $used ? DB::table('game_rooms')->where('id', $roomId)->update(['currency' => 'CH']) : DB::table('game_rooms')->where('id', $roomId)->delete();
            }
            DB::table('game_rooms')->whereIn('currency', ['VC', 'GP', 'GD'])->update(['currency' => 'CH']);
            DB::table('game_sessions')->whereIn('currency', self::OLD)->update(['currency' => 'CH']);
            DB::table('game_bets')->whereIn('currency', self::OLD)->update(['currency' => 'CH']);

            DB::table('practice_games')->join('practice_matches', 'practice_matches.id', '=', 'practice_games.practice_match_id')
                ->where('practice_matches.currency', 'CP')->where('practice_games.reserve_status', 'held')
                ->update(['practice_games.reserve_status' => 'released']);
            DB::table('practice_matches')->where('currency', 'CP')->where('status', 'active')->update(['status' => 'abandoned']);
            DB::table('practice_matches')->where('currency', '!=', 'GD')->update(['currency' => 'GD']);
        });
    }

    /** Move every Gold Points balance into the owner's Gold wallet, 1:1, with a ledger row. */
    private function goldPointsIntoGold(): void
    {
        foreach (DB::table('wallets')->where('currency', 'GP')->where('type', 'player')->where('balance', '>', 0)->get() as $gp) {
            $gold = DB::table('wallets')->where('user_id', $gp->user_id)->where('currency', 'GD')->where('type', 'player')->first();

            if (! $gold) {
                $id = DB::table('wallets')->insertGetId(['user_id' => $gp->user_id, 'currency' => 'GD', 'type' => 'player', 'balance' => 0, 'is_frozen' => false, 'created_at' => now(), 'updated_at' => now()]);
                $gold = DB::table('wallets')->find($id);
            }

            DB::table('wallets')->where('id', $gold->id)->update(['balance' => $gold->balance + $gp->balance, 'updated_at' => now()]);
            DB::table('wallet_transactions')->insert([
                'reference' => 'TX'.strtoupper((string) Str::ulid()),
                'idempotency_key' => "gold-points-retired:{$gp->user_id}",
                'type' => 'OUT_OF_GOLD_REWARD',
                'currency' => 'GD',
                'source_wallet_id' => null,
                'destination_wallet_id' => $gold->id,
                'amount' => $gp->balance,
                'source_balance_before' => null,
                'source_balance_after' => null,
                'destination_balance_before' => $gold->balance,
                'destination_balance_after' => $gold->balance + $gp->balance,
                'status' => 'completed',
                'reason' => 'Gold Points retired: moved into Gold 1:1',
                'related_player_id' => $gp->user_id,
                'metadata' => json_encode(['single_player' => true, 'gold_points_retired' => true]),
                'created_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Irreversible: restore storage/backups/553-before-gold-chips-*.sql to go back.
    }
};
