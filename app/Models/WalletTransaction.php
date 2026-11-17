<?php

namespace App\Models;

use App\Enums\Currency;
use App\Enums\TransactionStatus;
use App\Enums\TransactionType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use LogicException;

/**
 * Immutable ledger entry. Mistakes are corrected with REVERSAL entries,
 * never by editing or deleting a row.
 */
class WalletTransaction extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'type' => TransactionType::class,
            'currency' => Currency::class,
            'status' => TransactionStatus::class,
            'amount' => 'integer',
            'source_balance_before' => 'integer',
            'source_balance_after' => 'integer',
            'destination_balance_before' => 'integer',
            'destination_balance_after' => 'integer',
            'metadata' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Ledger transactions are immutable. Use a reversal.'));
        static::deleting(fn () => throw new LogicException('Ledger transactions cannot be deleted. Use a reversal.'));
    }

    public function source(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'source_wallet_id');
    }

    public function destination(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'destination_wallet_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function relatedPlayer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'related_player_id');
    }

    public function relatedAgent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'related_agent_id');
    }

    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversal_of_id');
    }

    public function reversedBy(): HasOne
    {
        return $this->hasOne(self::class, 'reversal_of_id');
    }

    /**
     * Transactions touching any of the given wallets.
     *
     * @param  array<int>  $walletIds
     */
    public function scopeForWallets(Builder $query, array $walletIds): Builder
    {
        return $query->where(function (Builder $q) use ($walletIds) {
            $q->whereIn('source_wallet_id', $walletIds)->orWhereIn('destination_wallet_id', $walletIds);
        });
    }
}
