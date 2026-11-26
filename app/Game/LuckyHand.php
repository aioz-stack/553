<?php

namespace App\Game;

/**
 * Lucky Hand (Declared Luck) on a player's dealt 13 cards — Single Player and Multiplayer.
 *
 * Only these three qualify (any ONE of them):
 *  - three_flushes   "3-Flushes":  the 13 cards split into a 3-card Front, 5-card Middle and
 *                                  5-card Back that are each one suit.
 *  - three_straights "3-Straight": the 13 cards split into a 3-card straight Front and 5-card
 *                                  straight Middle and Back (HandEvaluator's straight rules: the
 *                                  Ace plays high or low — A-2-3 / Q-K-A, A-2-3-4-5 / T-J-Q-K-A).
 *  - no_face_cards   "No Faces":   no Jack, Queen or King among the 13 cards (Aces are not faces).
 *  - six_pairs       "6 Pairs":    six distinct pairs — six different ranks each held at least twice
 *                                  (12 cards); the 13th card never invalidates it (it may even make
 *                                  one pair trips). Four of a kind is one pair of that rank, not two.
 *
 * Detection is server-side only and always runs on the dealt cards, never on a label the
 * client sends, so a declaration can't be faked. When several apply, the first in TYPES order
 * is reported (the reward is the same: lucky_multiplier × bet).
 */
final class LuckyHand
{
    public const TYPES = ['three_flushes', 'three_straights', 'no_face_cards', 'six_pairs'];

    public const LABELS = [
        'three_flushes' => '3-Flushes',
        'three_straights' => '3-Straight',
        'no_face_cards' => 'No Faces',
        'six_pairs' => '6 Pairs',
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

        if ($lanes = self::threeFlushes($cards)) {
            return self::found('three_flushes', self::order($lanes));
        }

        if ($lanes = self::threeStraights($cards)) {
            return self::found('three_straights', self::order($lanes));
        }

        if (self::hasNoFaceCards($cards)) {
            return self::found('no_face_cards', AutoArranger::arrange($cards));
        }

        if (self::isSixPairs($cards)) {
            return self::found('six_pairs', AutoArranger::arrange($cards));
        }

        return null;
    }

    /**
     * No Jack, Queen or King among the cards (2–10 and Aces only).
     *
     * @param  list<string>  $cards
     */
    public static function hasNoFaceCards(array $cards): bool
    {
        foreach ($cards as $card) {
            if (in_array($card[0], ['J', 'Q', 'K'], true)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Six distinct pairs: at least six different ranks held twice or more.
     *
     * @param  list<string>  $cards
     */
    public static function isSixPairs(array $cards): bool
    {
        $counts = array_count_values(array_map(fn (string $c) => $c[0], $cards));

        return count(array_filter($counts, fn (int $n) => $n >= 2)) >= 6;
    }

    /** The announcement shown when the hand is detected / declared, e.g. "6 PAIRS – LUCKY HAND". */
    public static function announcement(string $type): string
    {
        return mb_strtoupper(self::LABELS[$type] ?? $type).' – LUCKY HAND';
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
     * A split into a 3-card straight and two 5-card straights, or null.
     *
     * @param  list<string>  $cards
     * @return array{0: list<string>, 1: list<string>, 2: list<string>}|null front, five, five
     */
    public static function threeStraights(array $cards): ?array
    {
        $cards = array_values($cards);
        if (count($cards) !== 13) {
            return null;
        }

        // Straights depend only on ranks: work on rank counts (at most 10 × 10 five-card rank runs to
        // try) instead of every 5-card subset, then deal the actual cards out per rank.
        $byRank = [];
        foreach ($cards as $card) {
            $byRank[Card::fromString($card)->rank][] = $card;
        }
        $counts = array_map('count', $byRank);
        $fives = self::rankRuns(5);
        $threes = self::rankRuns(3);

        foreach ($fives as $i => $a) {
            $left = self::takeRun($counts, $a);
            if ($left === null) {
                continue;
            }
            foreach (array_slice($fives, $i, null, true) as $b) {
                $rest = self::takeRun($left, $b);
                if ($rest === null) {
                    continue;
                }
                foreach ($threes as $c) {
                    $none = self::takeRun($rest, $c);
                    if ($none !== null && array_sum($none) === 0) {
                        $pool = $byRank;
                        $deal = function (array $run) use (&$pool): array {
                            $lane = [];
                            foreach ($run as $r) {
                                $lane[] = array_shift($pool[$r]);
                            }

                            return $lane;
                        };

                        $five = $deal($a);
                        $other = $deal($b);

                        return [$deal($c), $five, $other];
                    }
                }
            }
        }

        return null;
    }

    /**
     * Every run of $length consecutive ranks (Ace high or low: 14 also plays as 1).
     *
     * @return list<list<int>>
     */
    private static function rankRuns(int $length): array
    {
        static $cache = [];

        return $cache[$length] ??= array_map(
            fn (int $low) => array_map(fn (int $r) => $r === 1 ? 14 : $r, range($low, $low + $length - 1)),
            range(1, 15 - $length),
        );
    }

    /**
     * The rank counts left after using one card of each rank in $run, or null if one is missing.
     *
     * @param  array<int, int>  $counts
     * @param  list<int>  $run
     * @return array<int, int>|null
     */
    private static function takeRun(array $counts, array $run): ?array
    {
        foreach ($run as $rank) {
            if (($counts[$rank] ?? 0) < 1) {
                return null;
            }
            $counts[$rank]--;
        }

        return $counts;
    }

    /**
     * Consecutive distinct ranks (3 or 5 cards), the Ace high or low: A-2-3 and Q-K-A, A-2-3-4-5
     * and T-J-Q-K-A — the same rule HandEvaluator uses for five-card straights.
     *
     * @param  list<string>  $cards
     */
    public static function isStraight(array $cards): bool
    {
        $ranks = array_map(fn (string $c) => Card::fromString($c)->rank, $cards);

        if (count(array_unique($ranks)) !== count($ranks)) {
            return false;
        }

        sort($ranks);
        if (end($ranks) - $ranks[0] === count($ranks) - 1) {
            return true;
        }

        // Ace low: 14 counts as 1.
        $low = array_map(fn (int $r) => $r === 14 ? 1 : $r, $ranks);
        sort($low);

        return end($low) - $low[0] === count($low) - 1;
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
