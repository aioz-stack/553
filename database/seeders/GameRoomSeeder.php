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
            ['slug' => 'vc-starter', 'name' => 'Starter Table', 'description' => 'Chips. Winner takes all, ties split.', 'currency' => 'CH', 'entry_amount' => 9_000, 'payout_mode' => 'winner_takes_all', 'platform_fee_bps' => 500, 'tie_handling' => 'split_equally'],
            ['slug' => 'vc-round-bank', 'name' => 'Round Bank', 'description' => 'Chips. 12 rounds; the banker rotates every round. Everyone plays the banker.', 'currency' => 'CH', 'entry_amount' => 5_000, 'max_bet' => 50_000, 'payout_mode' => 'winner_takes_all', 'game_mode' => 'round_bank', 'rounds_total' => 12, 'platform_fee_bps' => 500, 'tie_handling' => 'split_equally', 'arrangement_seconds' => 60, 'min_players' => 2],
            ['slug' => 'vc-banker', 'name' => 'Banker Mode', 'description' => 'Chips. 12 rounds; the table creator banks every round.', 'currency' => 'CH', 'entry_amount' => 5_000, 'max_bet' => 50_000, 'payout_mode' => 'winner_takes_all', 'game_mode' => 'banker', 'rounds_total' => 12, 'platform_fee_bps' => 500, 'tie_handling' => 'split_equally', 'arrangement_seconds' => 60, 'min_players' => 2],
            ['slug' => 'vc-points-bank', 'name' => 'Points Bank', 'description' => 'Classic four-player game. Every point pays from the pooled bank.', 'currency' => 'CH', 'entry_amount' => 18_000, 'payout_mode' => 'round_bank', 'platform_fee_bps' => 500, 'point_value' => 2_000, 'tie_handling' => 'split_equally'],
            ['slug' => 'vc-high-roller', 'name' => 'High Roller', 'description' => 'Chips. Ties carry the pot forward.', 'currency' => 'CH', 'entry_amount' => 90_000, 'payout_mode' => 'winner_takes_all', 'platform_fee_bps' => 1000, 'tie_handling' => 'carry_forward'],
            ['slug' => 'vc-blitz', 'name' => 'Blitz (45s)', 'description' => 'Fast arrangement timer, tie-breaker on Back hand.', 'currency' => 'CH', 'entry_amount' => 4_500, 'payout_mode' => 'winner_takes_all', 'platform_fee_bps' => 500, 'tie_handling' => 'tie_breaker', 'arrangement_seconds' => 45],
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
