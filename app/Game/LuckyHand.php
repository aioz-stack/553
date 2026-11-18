<?php

namespace App\Game;

/**
 * Declared Luck: Lucky Hand detection on a player's dealt 13 cards (banker modes).
 *
 * Any ONE of these qualifies (they are not required together):
 *  - three_flushes:  the cards split into a 3-card Front, 5-card Middle and
 *                    5-card Back that are each a single suit.
 *  - no_face_cards:  none of the 13 cards is a Jack, Queen or King (only 2–10 and Aces).
 *  - six_pairs:      six pairs among the 13 cards. Pairs are counted per rank as
 *                    floor(count / 2), so trips give one pair and quads give two.
 *
 * Detection is server-side only and runs on the dealt cards, so a declaration
 * can never be faked by the client. When several apply, the first in
 * TYPES order is reported (the payout is the same: lucky_multiplier × bet).
 */
final class LuckyHand
{
    public const TYPES = ['three_flushes', 'no_face_cards', 'six_pairs'];

    public const LABELS = [
        'three_flushes' => 'Three Flushes',
        'no_face_cards' => 'No Face Cards',
        'six_pairs' => 'Six Pairs',
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
