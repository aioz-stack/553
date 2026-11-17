<?php

namespace App\Game\Payout;

use LogicException;

/**
 * Round Bank (initial cumulative bank implementation).
 *
 * Every player's entry is pooled into the bank. Each scoring point is worth
 * `point_value` minor units, paid out of the bank:
 *
 *   gross_i = entry_i + score_i × point_value
 *
 * Because scoring is zero-sum, Σ gross_i = bank exactly. point_value is
 * capped at floor(entry / 9) (the maximum possible loss is 9 points), so no
 * player can lose more than their entry and no gross is negative.
 *
 * Platform fee ("rake on winnings"): fee_i = floor(max(0, score_i × point_value) × fee_bps / 10000)
 * is deducted from each winner's gain. That fee is attributed to the winner
 * who paid it for commission purposes. Round Bank never carries forward;
 * any carry-in from an earlier Winner-Takes-All tie is left in the room bank.
 */
final class RoundBankPayout implements PayoutStrategy
{
    public function calculate(PayoutInput $input): PayoutResult
    {
        $order = $input->playersBySeat();
        $entry = min($input->entries);
        $pointValue = min($input->pointValue, intdiv($entry, 9));

        if ($pointValue < 0) {
            throw new LogicException('Point value cannot be negative.');
        }

        $payouts = [];
        $feeAttribution = [];

        foreach ($order as $id) {
            $gain = $input->scores[$id] * $pointValue;
            $fee = $gain > 0 ? intdiv($gain * $input->feeBps, 10000) : 0;
            $payouts[$id] = $input->entries[$id] + $gain - $fee;
            $feeAttribution[$id] = $fee;
        }

        $result = new PayoutResult(
            $payouts,
            array_sum($feeAttribution),
            $input->carryIn,
            $feeAttribution,
            ['mode' => 'round_bank', 'point_value' => $pointValue],
        );
        $result->assertBalanced($input->pot(), $input->carryIn);

        return $result;
    }
}
