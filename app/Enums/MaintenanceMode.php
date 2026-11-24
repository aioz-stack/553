<?php

namespace App\Enums;

/**
 * Platform maintenance, set only from the Admin Panel (App\Services\System\MaintenanceService).
 *
 * | Mode            | Mobile game / matchmaking / table entry | Agent & player transactions |
 * | full            | blocked (maintenance screen)            | blocked                     |
 * | mobile_game     | blocked (maintenance screen)            | normal                      |
 * | agents_players  | normal                                  | blocked                     |
 * | off             | normal                                  | normal                      |
 */
enum MaintenanceMode: string
{
    case Full = 'full';
    case MobileGame = 'mobile_game';
    case AgentsPlayers = 'agents_players';
    case Off = 'off';

    public function label(): string
    {
        return match ($this) {
            self::Full => 'Full Maintenance',
            self::MobileGame => 'Mobile Game',
            self::AgentsPlayers => 'Agents/Players',
            self::Off => 'OFF',
        };
    }

    /** The Player Mobile Game (lobby, matchmaking, table entry, gameplay) is closed. */
    public function gameBlocked(): bool
    {
        return $this === self::Full || $this === self::MobileGame;
    }

    /** Wallet / Chips / commission transactions of Agents (every level) and Players are closed. */
    public function transactionsBlocked(): bool
    {
        return $this === self::Full || $this === self::AgentsPlayers;
    }
}
