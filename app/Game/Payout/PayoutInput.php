<?php

namespace App\Game\Payout;

use App\Game\Arrangement;

final class PayoutInput
{
    /**
     * @param  array<int, int>  $entries  playerId => entry paid (minor units)
     * @param  array<int, int>  $scores  playerId => total score
     * @param  array<int, int>  $seats  playerId => seat number (deterministic remainder order)
     * @param  array<int, Arrangement>  $arrangements  playerId => arrangement (tie-breaker)
     * @param  array<int, bool>  $fouls  playerId => fouled?
     */
    public function __construct(
        public readonly array $entries,
        public readonly array $scores,
        public readonly array $seats,
        public readonly array $arrangements,
        public readonly array $fouls,
        public readonly int $feeBps,
        public readonly int $pointValue,
        public readonly string $tieHandling,
        public readonly int $carryIn = 0,
    ) {}

    public function pot(): int
    {
        return array_sum($this->entries);
    }

    /**
     * Player ids ordered by seat.
     *
     * @return list<int>
     */
    public function playersBySeat(): array
    {
        $seats = $this->seats;
        asort($seats);

        return array_keys($seats);
    }
}
