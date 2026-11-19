<?php

namespace Database\Factories;

use App\Enums\Currency;
use App\Enums\PayoutMode;
use App\Enums\RoomStatus;
use App\Enums\RoomVisibility;
use App\Enums\TieHandling;
use App\Enums\TimeoutPolicy;
use App\Models\GameRoom;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<GameRoom>
 */
class GameRoomFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = 'Room '.Str::upper(Str::random(4));

        return [
            'name' => $name,
            'slug' => Str::slug($name).'-'.Str::lower(Str::random(4)),
            'description' => 'Test room',
            'currency' => Currency::CH,
            'entry_amount' => 9000, // 90.00 Chips
            'payout_mode' => PayoutMode::WinnerTakesAll,
            'platform_fee_bps' => 1000, // 10%
            'point_value' => null,
            'max_players' => 4,
            'min_players' => 4,
            'arrangement_seconds' => 90,
            'tie_handling' => TieHandling::SplitEqually,
            'timeout_policy' => TimeoutPolicy::AutoArrange,
            'allow_foul_submission' => false,
            'visibility' => RoomVisibility::Public,
            'status' => RoomStatus::Active,
        ];
    }

    public function roundBank(): static
    {
        return $this->state(fn () => ['payout_mode' => PayoutMode::RoundBank]);
    }
}
