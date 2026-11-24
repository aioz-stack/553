<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One hierarchy revenue share of a Chips → Keys exchange (credited to the recipient's Chips wallet). */
class KeyExchangeShare extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['percent_bps' => 'integer', 'amount' => 'integer'];
    }

    public function exchange(): BelongsTo
    {
        return $this->belongsTo(KeyExchange::class, 'key_exchange_id');
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_user_id');
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }
}
