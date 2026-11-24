<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A Shop exchange (final once completed; see KeyExchangeService).
 *
 * direction 'chips_to_keys' (current): the player paid chips_amount Chips and received keys_amount
 * Keys; the Chips were shared with the hierarchy (shares). direction 'keys_out' (earlier): the
 * player gave Keys for reward_amount in reward_currency.
 */
class KeyExchange extends Model
{
    public const COMPLETED = 'completed';

    public const REJECTED = 'rejected';

    public const CHIPS_TO_KEYS = 'chips_to_keys';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['keys_amount' => 'integer', 'chips_amount' => 'integer', 'reward_amount' => 'integer', 'hierarchy' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function upline(): BelongsTo
    {
        return $this->belongsTo(User::class, 'upline_user_id');
    }

    public function shares(): HasMany
    {
        return $this->hasMany(KeyExchangeShare::class);
    }

    public function keysTransaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class, 'keys_transaction_id');
    }

    public function chipsTransaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class, 'chips_transaction_id');
    }

    public function rewardTransaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class, 'reward_transaction_id');
    }
}
