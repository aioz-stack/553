<?php

namespace App\Enums;

enum Currency: string
{
    case CP = 'CP';
    case VC = 'VC';
    /** Single Player Gold: free-play, won and lost automatically in Single Player only. */
    case GD = 'GD';
    /** Gold Points: free reward points (the Out of Gold claim), convertible 1:1 into Gold only. */
    case GP = 'GP';

    /**
     * Only CP is cash-denominated. VC, Gold and Gold Points are free-play:
     * never withdrawable, redeemable or convertible into CP or VC.
     */
    public function isCash(): bool
    {
        return $this === self::CP;
    }

    /** Gold and Gold Points belong to Single Player and are never used by rooms, lobbies, allocations or payouts. */
    public function isSinglePlayer(): bool
    {
        return $this === self::GD || $this === self::GP;
    }

    /**
     * The currencies of rooms, lobbies, allocations, commissions and payouts.
     *
     * @return list<self>
     */
    public static function multiplayer(): array
    {
        return [self::CP, self::VC];
    }

    /** @return list<string> */
    public static function multiplayerValues(): array
    {
        return array_map(fn (self $c) => $c->value, self::multiplayer());
    }
}
