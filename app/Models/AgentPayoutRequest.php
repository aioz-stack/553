<?php

namespace App\Models;

use App\Enums\Currency;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AgentPayoutRequest extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['currency' => Currency::class, 'amount' => 'integer'];
    }

    public function agent(): BelongsTo
    {
        return $this->belongsTo(Agent::class);
    }
}
