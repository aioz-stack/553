<?php

namespace App\Game;

use InvalidArgumentException;

/**
 * Deterministic evaluator for 5-card (Middle/Back) and 3-card (Front) hands.
 *
 * Five-card ranking (high → low): Royal Flush, Straight Flush, Four of a Kind,
 * Full House, Flush, Straight, Three of a Kind, Two Pair, One Pair, High Card.
 *
 * Three-card ranking (high → low): Three of a Kind, One Pair, High Card.
 * Straights and flushes do NOT exist in a 3-card Front hand.
 *
 * Straights: A-K-Q-J-T is the highest; A-2-3-4-5 ("wheel") is the lowest
 * straight with the Ace playing low (its high card is 5).
 */
final class HandEvaluator
{
    /**
     * @param  list<Card>|list<string>  $cards
     */
    public static function evaluate(array $cards): HandValue
    {
        $cards = self::normalize($cards);

        return match (count($cards)) {
            3 => self::evaluateThree($cards),
            5 => self::evaluateFive($cards),
            default => throw new InvalidArgumentException('A hand must contain 3 or 5 cards.'),
        };
    }

    /**
     * @param  list<Card>  $cards
     */
    private static function evaluateThree(array $cards): HandValue
    {
        $groups = self::groupByRank($cards);

        if (count($groups) === 1) {
            return new HandValue(HandCategory::ThreeOfAKind, [array_key_first($groups)], 3);
        }

        if (count($groups) === 2) {
            [$pair, $kicker] = array_keys($groups);

            return new HandValue(HandCategory::OnePair, [$pair, $kicker], 3);
        }

        return new HandValue(HandCategory::HighCard, self::sortedRanks($cards), 3);
    }

    /**
     * @param  list<Card>  $cards
     */
    private static function evaluateFive(array $cards): HandValue
    {
        $groups = self::groupByRank($cards);
        $counts = array_values($groups);
        $ranks = array_keys($groups);

        $isFlush = count(array_unique(array_map(fn (Card $c) => $c->suit, $cards))) === 1;
        $straightHigh = self::straightHigh($cards);

        if ($isFlush && $straightHigh !== null) {
            return $straightHigh === 14
                ? new HandValue(HandCategory::RoyalFlush, [14], 5)
                : new HandValue(HandCategory::StraightFlush, [$straightHigh], 5);
        }

        if ($counts[0] === 4) {
            return new HandValue(HandCategory::FourOfAKind, $ranks, 5);
        }

        if ($counts[0] === 3 && $counts[1] === 2) {
            return new HandValue(HandCategory::FullHouse, $ranks, 5);
        }

        if ($isFlush) {
            return new HandValue(HandCategory::Flush, self::sortedRanks($cards), 5);
        }

        if ($straightHigh !== null) {
            return new HandValue(HandCategory::Straight, [$straightHigh], 5);
        }

        if ($counts[0] === 3) {
            return new HandValue(HandCategory::ThreeOfAKind, $ranks, 5);
        }

        if ($counts[0] === 2 && $counts[1] === 2) {
            return new HandValue(HandCategory::TwoPair, $ranks, 5);
        }

        if ($counts[0] === 2) {
            return new HandValue(HandCategory::OnePair, $ranks, 5);
        }

        return new HandValue(HandCategory::HighCard, self::sortedRanks($cards), 5);
    }

    /**
     * Rank => count, ordered by count desc then rank desc. This ordering makes
     * array_keys() the correct tie-break sequence for paired hands.
     *
     * @param  list<Card>  $cards
     * @return array<int, int>
     */
    private static function groupByRank(array $cards): array
    {
        $groups = [];

        foreach ($cards as $card) {
            $groups[$card->rank] = ($groups[$card->rank] ?? 0) + 1;
        }

        uksort($groups, function (int $a, int $b) use ($groups) {
            return [$groups[$b], $b] <=> [$groups[$a], $a];
        });

        return $groups;
    }

    /**
     * @param  list<Card>  $cards
     * @return list<int>
     */
    private static function sortedRanks(array $cards): array
    {
        $ranks = array_map(fn (Card $c) => $c->rank, $cards);
        rsort($ranks);

        return $ranks;
    }

    /**
     * @param  list<Card>  $cards
     */
    private static function straightHigh(array $cards): ?int
    {
        $ranks = array_unique(array_map(fn (Card $c) => $c->rank, $cards));

        if (count($ranks) !== 5) {
            return null;
        }

        rsort($ranks);

        if ($ranks[0] - $ranks[4] === 4) {
            return $ranks[0];
        }

        // Wheel: A-2-3-4-5, ace plays low.
        if ($ranks === [14, 5, 4, 3, 2]) {
            return 5;
        }

        return null;
    }

    /**
     * @param  list<Card>|list<string>  $cards
     * @return list<Card>
     */
    private static function normalize(array $cards): array
    {
        return array_values(array_map(fn ($c) => $c instanceof Card ? $c : Card::fromString($c), $cards));
    }
}
