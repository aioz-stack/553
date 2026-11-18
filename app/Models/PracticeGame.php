<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One Single Player round (player vs one bot) inside a Round Bank match.
 * Bots' hands and the server seed are only exposed after completion.
 */
class PracticeGame extends Model
{
    public const ARRANGING = 'arranging';

    public const COMPLETED = 'completed';

    public const ABANDONED = 'abandoned';

    protected $guarded = ['id'];

    protected $hidden = ['server_seed', 'hands', 'arrangements'];

    protected function casts(): array
    {
        return [
            'hands' => 'array',
            'arrangements' => 'array',
            'results' => 'array',
            'bets' => 'array',
            'completed_at' => 'datetime',
            'lucky_declared_at' => 'datetime',
            'player_reserve' => 'integer',
            'house_reserve' => 'integer',
            'round_number' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(PracticeMatch::class, 'practice_match_id');
    }
}
