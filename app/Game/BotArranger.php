<?php

namespace App\Game;

/**
 * Bot "intelligence" for arranging 13 cards (server-side only).
 *
 * The greedy AutoArranger always puts the single strongest five cards at the
 * Back, which often leaves a weak Middle and Front. BotArranger searches many
 * valid arrangements instead and keeps the one most likely to win lanes:
 *
 *  1. Candidate Backs: the K strongest distinct five-card hands of the 13.
 *  2. For each, candidate Middles: every five-card hand of the remaining 8
 *     that is not stronger than the Back; the last 3 cards are the Front.
 *  3. Discard fouled arrangements, score the rest and keep the best.
 *
 * Score = Σ lane weight × estimated chance of beating a typical opponent's
 * same lane (a rough table by hand category, nudged by the top rank). Front
 * and Middle wins are weighted a little higher because they are where most
 * lanes are decided. Deterministic for a given hand; never fouls.
 */
final class BotArranger
{
    /** Rough chance that a hand of this category wins its lane, by position. */
    private const BACK = [0 => 0.02, 1 => 0.10, 2 => 0.30, 3 => 0.50, 4 => 0.62, 5 => 0.72, 6 => 0.85, 7 => 0.96, 8 => 0.99, 9 => 1.0];

    private const MIDDLE = [0 => 0.08, 1 => 0.35, 2 => 0.60, 3 => 0.75, 4 => 0.84, 5 => 0.89, 6 => 0.95, 7 => 0.99, 8 => 1.0, 9 => 1.0];

    private const FRONT = [0 => 0.30, 1 => 0.75, 3 => 0.99];

    private const WEIGHTS = ['front' => 1.15, 'middle' => 1.1, 'back' => 1.0];

    /**
     * @param  list<string>  $cards
     */
    public static function arrange(array $cards, int $backCandidates = 14): Arrangement
    {
        $fives = [];
        foreach (self::combinations($cards, 5) as $combo) {
            $fives[] = [$combo, HandEvaluator::evaluate($combo)];
        }
        usort($fives, fn (array $a, array $b) => $b[1]->compare($a[1]));

        $best = null;
        $bestScore = -1.0;

        foreach (array_slice($fives, 0, $backCandidates) as [$back, $backValue]) {
            $rest = array_values(array_diff($cards, $back));

            foreach (self::combinations($rest, 5) as $middle) {
                $middleValue = HandEvaluator::evaluate($middle);

                if ($middleValue->compare($backValue) > 0) {
                    continue;
                }

                $front = array_values(array_diff($rest, $middle));
                $arrangement = new Arrangement($front, $middle, $back);

                if ($arrangement->isFoul()) {
                    continue;
                }

                $score = self::score($arrangement);

                if ($score > $bestScore) {
                    $best = $arrangement;
                    $bestScore = $score;
                }
            }
        }

        return $best ?? AutoArranger::arrange($cards);
    }

    public static function score(Arrangement $a): float
    {
        return self::WEIGHTS['front'] * self::chance(self::FRONT, $a->frontValue)
            + self::WEIGHTS['middle'] * self::chance(self::MIDDLE, $a->middleValue)
            + self::WEIGHTS['back'] * self::chance(self::BACK, $a->backValue);
    }

    /**
     * @param  array<int, float>  $table
     */
    private static function chance(array $table, HandValue $v): float
    {
        $base = $table[$v->category->value] ?? 1.0;
        $next = $table[$v->category->value + 1] ?? ($table[$v->category->value + 2] ?? 1.0);
        // Within a category, a higher top rank moves part of the way to the next category.
        $top = $v->ranks[0] ?? 2;

        return $base + ($next - $base) * max(0, $top - 2) / 12 * 0.8;
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
