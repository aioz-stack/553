<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Single Player Round Bank match: 12 rounds, you and three bots; the banker
 * rotates seat by seat (1 = you, 2-4 = bots).
 */
class PracticeMatch extends Model
{
    public const ACTIVE = 'active';

    public const COMPLETED = 'completed';

    public const ABANDONED = 'abandoned';

    /** Ended early: a settled round left the player unable to cover the next one (Single Player Gold). */
    public const OUT_OF_GOLD = 'out_of_gold';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'wagering' => 'boolean',
            'player_net' => 'integer',
            'rounds_total' => 'integer',
            'rounds_played' => 'integer',
            'completed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function rounds(): HasMany
    {
        return $this->hasMany(PracticeGame::class)->orderBy('round_number');
    }

    /** Banker seat for a 1-based round: 1 (you), 2, 3, 4, 1, … — each seat banks 3 times in 12 rounds. */
    public static function bankerFor(int $round): int
    {
        return (($round - 1) % 4) + 1;
    }
}
