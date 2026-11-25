<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GameSubmission extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'front' => 'array',
            'middle' => 'array',
            'back' => 'array',
            'is_foul' => 'boolean',
            'is_auto' => 'boolean',
            'lucky_failed' => 'boolean',
            'lucky_failed' => 'boolean',
            'lucky_failed' => 'boolean',
            'submitted_at' => 'datetime',
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
