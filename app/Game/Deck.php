<?php

namespace App\Game;

/**
 * Standard 52-card deck with a verifiable, seed-driven shuffle.
 *
 * Fairness / auditability ("shuffle commitment"):
 *  1. The server draws a 32-byte seed from the OS CSPRNG (random_bytes).
 *  2. The deck order is derived deterministically from that seed with a
 *     Fisher–Yates shuffle whose random indices come from HMAC-SHA256(seed, counter)
 *     with rejection sampling (no modulo bias).
 *  3. Before dealing, commitment = sha256(seedHex . "|" . deck) is stored and
 *     shown to players. The seed is revealed only after the game completes,
 *     so anyone can recompute the deck and the commitment.
 */
final class Deck
{
    /**
     * @return list<string>
     */
    public static function ordered(): array
    {
        $cards = [];

        foreach (Card::SUITS as $suit) {
            foreach (Card::RANKS as $rank) {
                $cards[] = $rank.$suit;
            }
        }

        return $cards;
    }

    public static function newSeed(): string
    {
        return bin2hex(random_bytes(32));
    }

    /**
     * @return list<string>
     */
    public static function shuffled(string $seedHex): array
    {
        $deck = self::ordered();
        $stream = new SeededRandom($seedHex);

        for ($i = count($deck) - 1; $i > 0; $i--) {
            $j = $stream->intBetween(0, $i);
            [$deck[$i], $deck[$j]] = [$deck[$j], $deck[$i]];
        }

        return $deck;
    }

    /**
     * @param  list<string>  $deck
     */
    public static function commitment(string $seedHex, array $deck): string
    {
        return hash('sha256', $seedHex.'|'.implode(',', $deck));
    }

    public static function verify(string $seedHex, string $commitment): bool
    {
        return hash_equals($commitment, self::commitment($seedHex, self::shuffled($seedHex)));
    }

    /**
     * Deal 13 cards to each of four seats in round-robin (clockwise) order, one card at a time
     * from the top of the deck, starting at $firstSeat: deck[0] goes to $firstSeat, deck[1] to the
     * next seat clockwise, and so on until every seat holds $perSeat cards.
     *
     * @param  list<string>  $deck
     * @return array<int, list<string>> seat (1..4) => 13 cards, each in the order received
     */
    public static function deal(array $deck, int $seats = 4, int $perSeat = 13, int $firstSeat = 1): array
    {
        $hands = array_fill(1, $seats, []);

        for ($i = 0; $i < $seats * $perSeat; $i++) {
            $hands[(($firstSeat - 1 + $i) % $seats) + 1][] = $deck[$i];
        }

        return $hands;
    }

    /**
     * Deal one card at a time to the given seats in this order (clockwise, the seat after the banker
     * first), $perSeat each — only to occupied seats, so a 2- or 3-player table deals 26 / 39 cards.
     * With all four seats in order this is exactly deal($deck, 4, $perSeat, $order[0]).
     *
     * @param  list<string>  $deck
     * @param  list<int>  $order  seat numbers
     * @return array<int, list<string>> seat => cards
     */
    public static function dealTo(array $deck, array $order, int $perSeat = 13): array
    {
        $order = array_values($order);
        $n = count($order);
        $hands = array_fill_keys($order, []);

        for ($i = 0; $i < $n * $perSeat; $i++) {
            $hands[$order[$i % $n]][] = $deck[$i];
        }

        return $hands;
    }
}
