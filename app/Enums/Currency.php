<?php

namespace App\Enums;

/**
 * The game has exactly two currencies, kept as two independent wallet systems:
 *
 *  - GD — Gold: Single Player only (bets, winnings, losses, the Out of Gold reward).
 *  - CH — Chips: Multiplayer only (rooms, lobbies, entry, winnings, losses, platform
 *    fees, agent allocations and commissions).
 *
 * Neither is cash: nothing can be deposited, withdrawn, redeemed or exchanged, and
 * the two can never be mixed, transferred or used for each other (LedgerService
 * refuses any transfer whose wallets are not all in the transfer currency).
 */
enum Currency: string
{
    case GD = 'GD';
    case CH = 'CH';

    public function label(): string
    {
        return match ($this) {
            self::GD => 'Gold',
            self::CH => 'Chips',
        };
    }

    /** Gold belongs to Single Player only. */
    public function isSinglePlayer(): bool
    {
        return $this === self::GD;
    }

    /**
     * The currency of rooms, lobbies, allocations, commissions and payouts.
     *
     * @return list<self>
     */
    public static function multiplayer(): array
    {
        return [self::CH];
    }

    /** @return list<string> */
    public static function multiplayerValues(): array
    {
        return array_map(fn (self $c) => $c->value, self::multiplayer());
    }
}
