<?php

namespace Database\Seeders;

use App\Models\GameRoom;
use Illuminate\Database\Seeder;

/**
 * Initial room configurations. Amounts are minor units (100 = 1.00).
 * CP rooms are created but cannot be joined while FEATURE_CP_WAGERING=false.
 */
class GameRoomSeeder extends Seeder
{
    public function run(): void
    {
        $rooms = [
            ['slug' => 'vc-starter', 'name' => 'Starter Table', 'description' => 'Free-play VC. Winner takes all, ties split.', 'currency' => 'VC', 'entry_amount' => 9_000, 'payout_mode' => 'winner_takes_all', 'platform_fee_bps' => 500, 'tie_handling' => 'split_equally'],
            ['slug' => 'vc-round-bank', 'name' => 'Round Bank', 'description' => 'Free-play VC. Every point pays from the bank.', 'currency' => 'VC', 'entry_amount' => 18_000, 'payout_mode' => 'round_bank', 'platform_fee_bps' => 500, 'point_value' => 2_000, 'tie_handling' => 'split_equally'],
            ['slug' => 'vc-high-roller', 'name' => 'High Roller', 'description' => 'Free-play VC. Ties carry the pot forward.', 'currency' => 'VC', 'entry_amount' => 90_000, 'payout_mode' => 'winner_takes_all', 'platform_fee_bps' => 1000, 'tie_handling' => 'carry_forward'],
            ['slug' => 'vc-blitz', 'name' => 'Blitz (45s)', 'description' => 'Fast arrangement timer, tie-breaker on Back hand.', 'currency' => 'VC', 'entry_amount' => 4_500, 'payout_mode' => 'winner_takes_all', 'platform_fee_bps' => 500, 'tie_handling' => 'tie_breaker', 'arrangement_seconds' => 45],
            ['slug' => 'cp-classic', 'name' => 'CP Classic', 'description' => 'CP room — disabled until regulatory approval.', 'currency' => 'CP', 'entry_amount' => 10_000, 'payout_mode' => 'winner_takes_all', 'platform_fee_bps' => 500, 'tie_handling' => 'split_equally'],
        ];

        foreach ($rooms as $room) {
            GameRoom::query()->updateOrCreate(['slug' => $room['slug']], $room + [
                'arrangement_seconds' => $room['arrangement_seconds'] ?? 90,
                'timeout_policy' => 'auto_arrange',
                'visibility' => 'public',
                'status' => 'active',
                'max_players' => 4,
                'min_players' => 4,
            ]);
        }
    }
}
