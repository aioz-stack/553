<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A private 13-card hand. Only ever returned to its owner (or to everyone
 * after the reveal stage).
 */
class GameCard extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['cards' => 'array', 'draft' => 'array', 'draft_saved_at' => 'datetime'];
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
