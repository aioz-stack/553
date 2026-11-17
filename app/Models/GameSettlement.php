<?php

namespace App\Models;

use App\Enums\Currency;
use App\Enums\SettlementStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GameSettlement extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'status' => SettlementStatus::class,
            'currency' => Currency::class,
            'breakdown' => 'array',
            'settled_at' => 'datetime',
            'pot' => 'integer',
            'carry_in' => 'integer',
            'platform_fee' => 'integer',
            'payout_total' => 'integer',
            'carry_out' => 'integer',
        ];
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(GameSession::class, 'game_session_id');
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(GamePayout::class);
    }
}
