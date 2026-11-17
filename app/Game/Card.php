<?php

namespace App\Game;

use InvalidArgumentException;

/**
 * A playing card encoded as two characters: rank + suit, e.g. "AS", "TD", "2C".
 *
 * Ranks: 2 3 4 5 6 7 8 9 T J Q K A (A is high, and also low in the A-2-3-4-5 straight).
 * Suits: C D H S. Suits never break ties in Pusoy 13.
 */
final class Card
{
    public const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    public const SUITS = ['C', 'D', 'H', 'S'];

    public function __construct(public readonly int $rank, public readonly string $suit) {}

    public static function fromString(string $code): self
    {
        $code = strtoupper(trim($code));

        if (strlen($code) !== 2) {
            throw new InvalidArgumentException("Invalid card code [{$code}].");
        }

        $rankIndex = array_search($code[0], self::RANKS, true);

        if ($rankIndex === false || ! in_array($code[1], self::SUITS, true)) {
            throw new InvalidArgumentException("Invalid card code [{$code}].");
        }

        return new self($rankIndex + 2, $code[1]);
    }

    /**
     * @param  list<string>  $codes
     * @return list<self>
     */
    public static function many(array $codes): array
    {
        return array_values(array_map(fn (string $code) => self::fromString($code), $codes));
    }

    public function code(): string
    {
        return self::RANKS[$this->rank - 2].$this->suit;
    }

    public static function isValidCode(mixed $code): bool
    {
        if (! is_string($code) || strlen($code) !== 2) {
            return false;
        }

        return in_array($code[0], self::RANKS, true) && in_array($code[1], self::SUITS, true);
    }
}
