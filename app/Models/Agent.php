<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Agent extends Model
{
    protected $guarded = ['id'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function players(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'agent_players', 'agent_id', 'player_id')
            ->withPivot(['assigned_at', 'assigned_by']);
    }

    public function referralCodes(): HasMany
    {
        return $this->hasMany(AgentReferralCode::class);
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(AgentCommission::class);
    }

    public function commissionRules(): HasMany
    {
        return $this->hasMany(AgentCommissionRule::class);
    }

    public function owns(User $player): bool
    {
        return AgentPlayer::query()->where('agent_id', $this->id)->where('player_id', $player->id)->exists();
    }
}
