<?php

namespace App\Models;

use App\Enums\Currency;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AgentCommissionRule extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['currency' => Currency::class, 'is_active' => 'boolean', 'rate_bps' => 'integer'];
    }

    public function agent(): BelongsTo
    {
        return $this->belongsTo(Agent::class);
    }
}
