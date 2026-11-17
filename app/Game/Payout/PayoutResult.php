<?php

namespace App\Game\Payout;

use LogicException;

final class PayoutResult
{
    /**
     * @param  array<int, int>  $payouts  playerId => amount credited back (minor units)
     * @param  array<int, int>  $feeAttribution  playerId => share of the platform fee (for commissions)
     * @param  array<string, mixed>  $notes
     */
    public function __construct(
        public readonly array $payouts,
        public readonly int $platformFee,
        public readonly int $carryOut,
        public readonly array $feeAttribution,
        public readonly array $notes = [],
    ) {}

    /**
     * Conservation check: nothing created, nothing lost.
     */
    public function assertBalanced(int $pot, int $carryIn): void
    {
        $out = array_sum($this->payouts) + $this->platformFee + $this->carryOut;

        if ($out !== $pot + $carryIn || array_sum($this->feeAttribution) !== $this->platformFee) {
            throw new LogicException("Payout does not balance: out={$out}, in=".($pot + $carryIn));
        }

        foreach ($this->payouts as $amount) {
            if ($amount < 0) {
                throw new LogicException('Negative payout computed.');
            }
        }
    }
}
