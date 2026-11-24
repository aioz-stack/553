<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A Shop exchange of Keys for Gold (final once completed; see KeyExchangeService). */
class KeyExchange extends Model
{
    public const COMPLETED = 'completed';

    public const REJECTED = 'rejected';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['keys_amount' => 'integer', 'gold_amount' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function keysTransaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class, 'keys_transaction_id');
    }

    public function goldTransaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class, 'gold_transaction_id');
    }
}
