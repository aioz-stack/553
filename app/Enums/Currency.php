<?php

namespace App\Enums;

/**
 * The game has three currencies, kept as three independent wallet systems:
 *
 *  - GD — Gold: Single Player only (bets, winnings, losses, the Out of Gold reward).
 *  - CH — Chips: Multiplayer only (rooms, lobbies, entry, winnings, losses, platform
 *    fees, agent allocations and commissions).
 *  - KY — Keys: a player wallet of its own (Main Lobby). Loaded by a Super Admin through the
 *    audited wallet adjustment; never allocated, paid as commission or bet. The only way out is
 *    the Shop's one-way Keys → Gold exchange (KeyExchangeService; final, never Gold → Keys).
 *
 * None is cash: nothing can be deposited, withdrawn, redeemed or exchanged for money, and
 * they can never be mixed, transferred or used for each other (LedgerService
 * refuses any transfer whose wallets are not all in the transfer currency).
 */
enum Currency: string
{
    case GD = 'GD';
    case CH = 'CH';
    case KY = 'KY';

    public function label(): string
    {
        return match ($this) {
            self::GD => 'Gold',
            self::CH => 'Chips',
            self::KY => 'Keys',
        };
    }

    /** Only Chips have agent / staff allocation and commission wallets. */
    public function hasAllocations(): bool
    {
        return $this === self::CH;
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
