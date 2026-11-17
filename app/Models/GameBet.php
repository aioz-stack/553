<?php

namespace App\Models;

use App\Enums\Currency;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One player's bet against the banker in a banker-mode round. Both sides
 * reserve `reserve` (2 × amount) in escrow via the linked wallet holds.
 */
class GameBet extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'currency' => Currency::class,
            'amount' => 'integer',
            'reserve' => 'integer',
            'is_auto' => 'boolean',
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
