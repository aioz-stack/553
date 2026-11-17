<?php

namespace App\Models;

use App\Enums\Currency;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdministratorLimit extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['currency' => Currency::class];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
