<?php

namespace App\Services\Wallet;

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Models\User;
use App\Models\Wallet;

/**
 * Describes one ledger movement. A null source is an issuance (points
 * created by Super Admin / platform reward); a null destination is a burn.
 */
final class TransferRequest
{
    /**
     * @param  array<string, mixed>  $metadata
     */
    public function __construct(
        public readonly TransactionType $type,
        public readonly Currency $currency,
        public readonly ?Wallet $source,
        public readonly ?Wallet $destination,
        public readonly int $amount,
        public readonly ?string $reason = null,
        public readonly ?User $actor = null,
        public readonly ?string $idempotencyKey = null,
        public readonly ?int $relatedPlayerId = null,
        public readonly ?int $relatedAgentId = null,
        public readonly ?int $gameSessionId = null,
        public readonly ?int $approvedBy = null,
        public readonly ?int $reversalOfId = null,
        public readonly array $metadata = [],
    ) {}
}
