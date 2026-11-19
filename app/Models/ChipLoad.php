<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One Chips load, withdrawal or load request (the Admin Panel's Load Logs).
 * Rows are written by App\Services\Wallet\ChipLoadService and AllocationService;
 * completed rows always point at the ledger transaction that moved the Chips.
 */
class ChipLoad extends Model
{
    public const LOAD = 'load';

    public const WITHDRAW = 'withdraw';

    public const REQUEST = 'request';

    public const COMPLETED = 'completed';

    public const PENDING = 'pending';

    public const REJECTED = 'rejected';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['amount' => 'integer', 'processed_at' => 'datetime'];
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(User::class, 'account_id');
    }

    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class, 'wallet_transaction_id');
    }
}
