<?php

namespace App\Game;

/**
 * Lucky Hand detection on a player's dealt 13 cards (banker modes).
 *
 * Qualifying combinations:
 *  - six_pairs:      six pairs among the 13 cards. Pairs are counted per rank as
 *                    floor(count / 2), so trips give one pair and quads give two.
 *  - three_flushes:  the cards split into a 3-card Front, 5-card Middle and
 *                    5-card Back that are each a single suit.
 *  - three_straights: the cards split into a 3-card Front straight and 5-card
 *                    Middle and Back straights. The Ace plays high or low
 *                    (A-2-3 / Q-K-A in front, A-2-3-4-5 / 10-J-Q-K-A in five-card lanes).
 *
 * Detection is server-side only and runs on the dealt cards, so a declaration
 * can never be faked by the client. When several apply, the first in
 * TYPES order is reported (the bonus is the same).
 */
final class LuckyHand
{
    public const TYPES = ['six_pairs', 'three_flushes', 'three_straights'];

    public const LABELS = [
        'six_pairs' => 'Six Pairs',
        'three_flushes' => 'Three Flushes',
        'three_straights' => 'Three Straights',
    ];

    /**
     * @param  list<string>  $cards
     * @return array{type: string, label: string, arrangement: Arrangement}|null
     */
    public static function detect(array $cards): ?array
    {
        if (count($cards) !== 13 || count(array_unique($cards)) !== 13) {
            return null;
        }

        if (self::isSixPairs($cards)) {
            return self::found('six_pairs', AutoArranger::arrange($cards));
        }

        if ($lanes = self::threeFlushes($cards)) {
            return self::found('three_flushes', self::order($lanes));
        }

        if ($lanes = self::threeStraights($cards)) {
            return self::found('three_straights', self::order($lanes));
        }

        return null;
    }

    /**
     * @param  list<string>  $cards
     */
    public static function isSixPairs(array $cards): bool
    {
        $counts = array_count_values(array_map(fn (string $c) => $c[0], $cards));

        return array_sum(array_map(fn (int $n) => intdiv($n, 2), $counts)) >= 6;
    }

    /**
     * @param  list<string>  $cards
     * @return array{0: list<string>, 1: list<string>, 2: list<string>}|null front, five, five
     */
    public static function threeFlushes(array $cards): ?array
    {
        $bySuit = [];

        foreach ($cards as $card) {
            $bySuit[$card[1]][] = $card;
        }

        $suits = array_keys($bySuit);

        // Assign a suit to each lane (sizes 3, 5, 5); counts must match exactly.
        foreach ($suits as $a) {
            foreach ($suits as $b) {
                foreach ($suits as $c) {
                    $need = [];
                    $need[$a] = ($need[$a] ?? 0) + 3;
                    $need[$b] = ($need[$b] ?? 0) + 5;
                    $need[$c] = ($need[$c] ?? 0) + 5;

                    $ok = count($need) === count($bySuit);

                    foreach ($need as $suit => $n) {
                        $ok = $ok && count($bySuit[$suit]) === $n;
                    }

                    if (! $ok) {
                        continue;
                    }

                    $pool = $bySuit;
                    $front = array_splice($pool[$a], 0, 3);
                    $middle = array_splice($pool[$b], 0, 5);
                    $back = array_splice($pool[$c], 0, 5);

                    return [$front, $middle, $back];
                }
            }
        }

        return null;
    }

    /**
     * @param  list<string>  $cards
     * @return array{0: list<string>, 1: list<string>, 2: list<string>}|null
     */
    public static function threeStraights(array $cards): ?array
    {
        $n = count($cards);

        for ($i = 0; $i < $n - 2; $i++) {
            for ($j = $i + 1; $j < $n - 1; $j++) {
                for ($k = $j + 1; $k < $n; $k++) {
                    $front = [$cards[$i], $cards[$j], $cards[$k]];

                    if (! self::isStraight($front)) {
                        continue;
                    }

                    $rest = array_values(array_diff($cards, $front));

                    foreach (self::fiveOfTen($rest) as $five) {
                        $other = array_values(array_diff($rest, $five));

                        if (self::isStraight($five) && self::isStraight($other)) {
                            return [$front, $five, $other];
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Consecutive distinct ranks; the Ace may play low.
     *
     * @param  list<string>  $cards
     */
    public static function isStraight(array $cards): bool
    {
        $ranks = array_map(fn (string $c) => Card::fromString($c)->rank, $cards);
        sort($ranks);

        if (count(array_unique($ranks)) !== count($ranks)) {
            return false;
        }

        $consecutive = fn (array $r) => end($r) - $r[0] === count($r) - 1;

        if ($consecutive($ranks)) {
            return true;
        }

        if (in_array(14, $ranks, true)) {
            $low = array_map(fn (int $r) => $r === 14 ? 1 : $r, $ranks);
            sort($low);

            return $consecutive($low);
        }

        return false;
    }

    /**
     * @param  list<string>  $cards  exactly 10 cards
     * @return \Generator<list<string>>
     */
    private static function fiveOfTen(array $cards): \Generator
    {
        $n = count($cards);

        for ($a = 0; $a < $n; $a++) {
            for ($b = $a + 1; $b < $n; $b++) {
                for ($c = $b + 1; $c < $n; $c++) {
                    for ($d = $c + 1; $d < $n; $d++) {
                        for ($e = $d + 1; $e < $n; $e++) {
                            yield [$cards[$a], $cards[$b], $cards[$c], $cards[$d], $cards[$e]];
                        }
                    }
                }
            }
        }
    }

    /**
     * Put the stronger five-card lane at the Back for display.
     *
     * @param  array{0: list<string>, 1: list<string>, 2: list<string>}  $lanes
     */
    private static function order(array $lanes): Arrangement
    {
        [$front, $a, $b] = $lanes;

        if (HandEvaluator::evaluate($a)->compare(HandEvaluator::evaluate($b)) > 0) {
            [$a, $b] = [$b, $a];
        }

        return new Arrangement($front, $a, $b);
    }

    /**
     * @return array{type: string, label: string, arrangement: Arrangement}
     */
    private static function found(string $type, Arrangement $arrangement): array
    {
        return ['type' => $type, 'label' => self::LABELS[$type], 'arrangement' => $arrangement];
    }
}
