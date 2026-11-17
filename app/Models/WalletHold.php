<?php

namespace App\Models;

use App\Enums\Currency;
use App\Enums\HoldStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A room entry reserved in escrow while a player is seated or playing.
 */
class WalletHold extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['currency' => Currency::class, 'status' => HoldStatus::class, 'amount' => 'integer'];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(GameTable::class, 'game_table_id');
    }
}
