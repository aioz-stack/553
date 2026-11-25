<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One Self Convert Revenue to Chips: the account's whole Revenue wallet moved into its Chips
 * wallet at the configured rate. Amounts in minor units.
 */
class RevenueConversion extends Model
{
    public const COMPLETED = 'completed';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'revenue_amount' => 'integer',
            'rate_bps' => 'integer',
            'chips_amount' => 'integer',
            'revenue_before' => 'integer',
            'revenue_after' => 'integer',
            'chips_before' => 'integer',
            'chips_after' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The ledger entry that credited the Chips (its reference is the conversion's reference number). */
    public function transaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class, 'wallet_transaction_id');
    }
}
