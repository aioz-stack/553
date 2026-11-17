<?php

namespace App\Models;

use App\Enums\Currency;
use App\Enums\WalletType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A single-currency balance. Balance changes ONLY through
 * App\Services\Wallet\LedgerService, which writes the matching ledger row.
 */
class Wallet extends Model
{
    protected $guarded = ['id', 'balance'];

    protected function casts(): array
    {
        return [
            'currency' => Currency::class,
            'type' => WalletType::class,
            'balance' => 'integer',
            'is_frozen' => 'boolean',
            'frozen_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function outgoing(): HasMany
    {
        return $this->hasMany(WalletTransaction::class, 'source_wallet_id');
    }

    public function incoming(): HasMany
    {
        return $this->hasMany(WalletTransaction::class, 'destination_wallet_id');
    }

    public function scopeOfType(Builder $query, WalletType $type): Builder
    {
        return $query->where('type', $type->value);
    }

    public function scopeCurrency(Builder $query, Currency $currency): Builder
    {
        return $query->where('currency', $currency->value);
    }

    public function isSystem(): bool
    {
        return $this->system_key !== null;
    }
}
