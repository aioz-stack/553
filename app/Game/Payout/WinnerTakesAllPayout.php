<?php

namespace App\Game\Payout;

use App\Enums\TieHandling;
use App\Game\Arrangement;

/**
 * Winner Takes All.
 *
 *  gross = pot + carry_in (carry-forward bank from earlier tied games)
 *  fee   = floor(pot × fee_bps / 10000)       — fee is charged on this game's pot only
 *  net   = gross − fee
 *  The highest total score receives `net`.
 *
 * Ties for the highest score (configured per room):
 *  - split_equally: net is divided equally; indivisible minor units go one
 *    each to the tied players in seat order (seat 1 first).
 *  - carry_forward: nobody is paid; net is carried into the room bank and
 *    added to the next game's prize pool.
 *  - tie_breaker: the strongest Back hand wins, then Middle, then Front.
 *    Players still tied after all three split equally (as above).
 *
 * The fee is attributed equally to all four players (remainder in seat
 * order) as the basis for agent commissions.
 */
final class WinnerTakesAllPayout implements PayoutStrategy
{
    public function calculate(PayoutInput $input): PayoutResult
    {
        $pot = $input->pot();
        $fee = intdiv($pot * $input->feeBps, 10000);
        $net = $pot + $input->carryIn - $fee;
        $order = $input->playersBySeat();
        $payouts = array_fill_keys($order, 0);

        $top = max($input->scores);
        $winners = array_values(array_filter($order, fn (int $id) => $input->scores[$id] === $top));
        $carryOut = 0;
        $notes = ['mode' => 'winner_takes_all', 'tied' => count($winners) > 1];

        if (count($winners) > 1) {
            $handling = TieHandling::from($input->tieHandling);

            if ($handling === TieHandling::CarryForward) {
                $carryOut = $net;
                $winners = [];
                $notes['resolution'] = 'carried_forward';
            } elseif ($handling === TieHandling::TieBreaker) {
                $winners = $this->breakTie($winners, $input->arrangements, $input->fouls);
                $notes['resolution'] = count($winners) > 1 ? 'tie_breaker_then_split' : 'tie_breaker';
            } else {
                $notes['resolution'] = 'split_equally';
            }
        }

        foreach (self::split($net - $carryOut, $winners) as $id => $amount) {
            $payouts[$id] = $amount;
        }

        $notes['winners'] = $winners;

        $result = new PayoutResult($payouts, $fee, $carryOut, self::split($fee, $order), $notes);
        $result->assertBalanced($pot, $input->carryIn);

        return $result;
    }

    /**
     * @param  list<int>  $tied
     * @param  array<int, Arrangement>  $arrangements
     * @param  array<int, bool>  $fouls
     * @return list<int>
     */
    private function breakTie(array $tied, array $arrangements, array $fouls): array
    {
        // A fouled hand never wins a tie-breaker against a valid hand.
        $valid = array_values(array_filter($tied, fn (int $id) => ! $fouls[$id]));
        $candidates = $valid === [] ? $tied : $valid;

        foreach (['back', 'middle', 'front'] as $position) {
            $best = null;
            $leaders = [];

            foreach ($candidates as $id) {
                $value = $arrangements[$id]->value($position);
                $cmp = $best === null ? 1 : $value->compare($best);

                if ($cmp > 0) {
                    $best = $value;
                    $leaders = [$id];
                } elseif ($cmp === 0) {
                    $leaders[] = $id;
                }
            }

            $candidates = $leaders;

            if (count($candidates) === 1) {
                break;
            }
        }

        return $candidates;
    }

    /**
     * Split an amount equally; the remainder goes one unit at a time in the
     * given (seat) order.
     *
     * @param  list<int>  $ids
     * @return array<int, int>
     */
    public static function split(int $amount, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $share = intdiv($amount, count($ids));
        $remainder = $amount - $share * count($ids);
        $result = [];

        foreach ($ids as $index => $id) {
            $result[$id] = $share + ($index < $remainder ? 1 : 0);
        }

        return $result;
    }
}
