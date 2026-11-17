<?php

namespace App\Models;

use App\Enums\GameMode;
use App\Enums\TableStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GameTable extends Model
{
    protected $guarded = ['id'];

    /**
     * @var array<string, mixed>
     */
    protected $attributes = [
        'game_mode' => 'classic',
        'rounds_total' => 1,
        'rounds_played' => 0,
    ];

    protected function casts(): array
    {
        return [
            'status' => TableStatus::class,
            'game_mode' => GameMode::class,
            'full_at' => 'datetime',
            'closed_at' => 'datetime',
            'next_round_at' => 'datetime',
            'rounds_total' => 'integer',
            'rounds_played' => 'integer',
        ];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(GameRoom::class, 'game_room_id');
    }

    public function players(): HasMany
    {
        return $this->hasMany(GamePlayer::class)->orderBy('seat');
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(GameSession::class);
    }

    public function currentSession(): BelongsTo
    {
        return $this->belongsTo(GameSession::class, 'current_session_id');
    }

    public function banker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'banker_user_id');
    }

    public function hasBanker(): bool
    {
        return $this->game_mode->hasBanker();
    }

    public function hasPlayer(User $user): bool
    {
        return $this->players()->where('user_id', $user->id)->exists();
    }
}
