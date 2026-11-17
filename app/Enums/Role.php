<?php

namespace App\Enums;

enum Role: string
{
    case SuperAdmin = 'super_admin';
    case Administrator = 'admin';
    case Agent = 'agent';
    case Player = 'player';

    /**
     * Higher level = more authority. Used for hierarchy checks.
     */
    public function level(): int
    {
        return match ($this) {
            self::SuperAdmin => 100,
            self::Administrator => 50,
            self::Agent => 20,
            self::Player => 1,
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::SuperAdmin => 'Super Admin',
            self::Administrator => 'Administrator',
            self::Agent => 'Agent',
            self::Player => 'Player',
        };
    }
}
