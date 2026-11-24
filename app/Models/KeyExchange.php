<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A Shop exchange of Keys for Chips (final once completed; see KeyExchangeService). reward_currency
 * says what was paid: CH, or GD for exchanges made before the Shop paid Chips. */
class KeyExchange extends Model
{
    public const COMPLETED = 'completed';

    public const REJECTED = 'rejected';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['keys_amount' => 'integer', 'reward_amount' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function keysTransaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class, 'keys_transaction_id');
    }

    public function rewardTransaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class, 'reward_transaction_id');
    }
}
