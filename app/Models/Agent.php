<?php

namespace App\Models;

use App\Enums\AgentLevel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Agent extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['level' => AgentLevel::class];
    }

    /** The upline agent (null = directly under the Administrator). */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_agent_id');
    }

    /** Agents directly below this one. */
    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_agent_id');
    }

    /**
     * This agent and every upline agent, nearest first (Silver → Master → Agent).
     *
     * @return list<self>
     */
    public function chain(): array
    {
        $chain = [];
        $seen = [];
        for ($a = $this; $a !== null && ! isset($seen[$a->id]); $a = $a->parent) {
            $seen[$a->id] = true;
            $chain[] = $a;
        }

        return $chain;
    }

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
