<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A Single Player practice deal (player vs three server bots). No currency.
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
            'completed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
