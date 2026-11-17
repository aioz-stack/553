<?php

namespace App\Models;

use App\Enums\Currency;
use App\Enums\GameStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class GameSession extends Model
{
    protected $guarded = ['id'];

    /**
     * The shuffle seed must never leave the server before completion.
     */
    protected $hidden = ['server_seed'];

    protected function casts(): array
    {
        return [
            'status' => GameStatus::class,
            'currency' => Currency::class,
            'config' => 'array',
            'server_seed' => 'encrypted',
            'seed_revealed' => 'boolean',
            'pot' => 'integer',
            'platform_fee' => 'integer',
            'arrangement_deadline' => 'datetime',
            'started_at' => 'datetime',
            'revealed_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(GameTable::class, 'game_table_id');
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(GameRoom::class, 'game_room_id');
    }

    public function cards(): HasMany
    {
        return $this->hasMany(GameCard::class)->orderBy('seat');
    }

    public function submissions(): HasMany
    {
        return $this->hasMany(GameSubmission::class);
    }

    public function results(): HasMany
    {
        return $this->hasMany(GameResult::class)->orderBy('placement');
    }

    public function handResults(): HasMany
    {
        return $this->hasMany(GameHandResult::class);
    }

    public function settlement(): HasOne
    {
        return $this->hasOne(GameSettlement::class);
    }

    public function holds(): HasMany
    {
        return $this->hasMany(WalletHold::class);
    }

    public function hasParticipant(User $user): bool
    {
        return $this->cards()->where('user_id', $user->id)->exists();
    }
}
