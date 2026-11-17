<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A friend request (user_id → friend_id). Accepted rows make both users
 * friends; there is only ever one row per pair.
 */
class Friendship extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['accepted_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function friend(): BelongsTo
    {
        return $this->belongsTo(User::class, 'friend_id');
    }

    public function scopeBetween(Builder $query, int $a, int $b): Builder
    {
        return $query->where(fn ($q) => $q->where(['user_id' => $a, 'friend_id' => $b])->orWhere(fn ($q) => $q->where(['user_id' => $b, 'friend_id' => $a])));
    }

    public function scopeInvolving(Builder $query, int $userId): Builder
    {
        return $query->where(fn ($q) => $q->where('user_id', $userId)->orWhere('friend_id', $userId));
    }

    public function otherId(int $me): int
    {
        return $this->user_id === $me ? $this->friend_id : $this->user_id;
    }
}
