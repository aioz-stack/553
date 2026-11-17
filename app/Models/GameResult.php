<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GameResult extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_foul' => 'boolean',
            'hand_labels' => 'array',
            'entry_amount' => 'integer',
            'payout_amount' => 'integer',
            'net_amount' => 'integer',
            'score' => 'integer',
            'bet_amount' => 'integer',
            'lane_results' => 'array',
            'lucky_bonus' => 'integer',
            'platform_fee' => 'integer',
            'round_number' => 'integer',
        ];
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(GameSession::class, 'game_session_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
