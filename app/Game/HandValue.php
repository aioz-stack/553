<?php

namespace App\Game;

/**
 * Comparable strength of a 3- or 5-card hand.
 *
 * Comparison: category first, then the tie-break ranks ("kickers") from
 * most to least significant. If every compared rank is equal the hands are
 * equal-strength (a tie) — suits never break ties.
 *
 * When a 3-card Front is compared to a 5-card Middle (order validation only),
 * only the overlapping tie-break ranks are compared; if those are all equal
 * the hands are treated as equal, which is allowed (Middle must be AT LEAST
 * as strong as Front).
 */
final class HandValue
{
    /**
     * @param  list<int>  $ranks  tie-break ranks, most significant first
     */
    public function __construct(
        public readonly HandCategory $category,
        public readonly array $ranks,
        public readonly int $size,
    ) {}

    public function compare(self $other): int
    {
        if ($this->category !== $other->category) {
            return $this->category->value <=> $other->category->value;
        }

        $length = min(count($this->ranks), count($other->ranks));

        for ($i = 0; $i < $length; $i++) {
            if ($this->ranks[$i] !== $other->ranks[$i]) {
                return $this->ranks[$i] <=> $other->ranks[$i];
            }
        }

        return 0;
    }

    public function label(): string
    {
        return $this->category->label();
    }
}
