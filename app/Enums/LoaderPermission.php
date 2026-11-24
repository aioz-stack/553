<?php

namespace App\Enums;

/**
 * What a Loader Account (employee) may do — the only three things it can ever be given. Kept
 * apart from the Administrator abilities (App\Enums\Ability) so a Loader can never be granted
 * an Admin function. Stored in the same permissions / permission_user tables.
 */
enum LoaderPermission: string
{
    case Loads = 'loader_loads';
    case Commissions = 'loader_commissions';
    case Passwords = 'loader_passwords';

    public function label(): string
    {
        return match ($this) {
            self::Loads => 'Load Transactions',
            self::Commissions => 'Commission Transactions',
            self::Passwords => 'Reset Passwords',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::Loads => 'View all Chips loads; load Chips to agents and players and process Chips requests (from the employer Admin\'s Chips)',
            self::Commissions => 'View commissions and process commission withdrawal (conversion) requests',
            self::Passwords => 'Reset passwords of Agents, Master Agents, Silver Agents and Players',
        };
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $p) => $p->value, self::cases());
    }
}
