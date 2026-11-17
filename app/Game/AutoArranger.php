<?php

namespace App\Game;

/**
 * Server-side arrangement used when a player's timer expires and the room's
 * timeout policy is "auto_arrange" (and for demo players in local dev).
 *
 * Greedy strategy — always produces a NON-fouled arrangement:
 *  1. Back  = strongest 5-card hand among all 13 cards (1,287 combinations).
 *  2. Middle = strongest 5-card hand among the remaining 8 (56 combinations).
 *  3. Front = the remaining 3 cards.
 * Back ≥ Middle because Back was the best of a superset. Middle ≥ Front
 * because Middle was the best 5 of 8 cards that include the Front's 3 cards.
 */
final class AutoArranger
{
    /**
     * @param  list<string>  $cards
     */
    public static function arrange(array $cards): Arrangement
    {
        $back = self::bestFive($cards);
        $remaining = array_values(array_diff($cards, $back));
        $middle = self::bestFive($remaining);
        $front = array_values(array_diff($remaining, $middle));

        return new Arrangement($front, $middle, $back);
    }

    /**
     * @param  list<string>  $cards
     * @return list<string>
     */
    private static function bestFive(array $cards): array
    {
        $best = null;
        $bestValue = null;

        foreach (self::combinations($cards, 5) as $combo) {
            $value = HandEvaluator::evaluate($combo);

            if ($bestValue === null || $value->compare($bestValue) > 0) {
                $best = $combo;
                $bestValue = $value;
            }
        }

        return $best;
    }

    /**
     * @param  list<string>  $items
     * @return \Generator<list<string>>
     */
    private static function combinations(array $items, int $size, int $start = 0, array $current = []): \Generator
    {
        if (count($current) === $size) {
            yield $current;

            return;
        }

        for ($i = $start, $n = count($items); $i <= $n - ($size - count($current)); $i++) {
            yield from self::combinations($items, $size, $i + 1, [...$current, $items[$i]]);
        }
    }
}
