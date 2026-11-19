<?php

namespace App\Enums;

/**
 * Agent levels, top to bottom: Administrator → Agent → Master Agent → Silver Agent.
 * Each account's Agent Registration Link creates the next level down; every level
 * (and the Administrator) can register Players with its Player Registration Link.
 */
enum AgentLevel: string
{
    case Agent = 'agent';
    case Master = 'master';
    case Silver = 'silver';

    public function label(): string
    {
        return match ($this) {
            self::Agent => 'Agent',
            self::Master => 'Master Agent',
            self::Silver => 'Silver Agent',
        };
    }

    /** The level an account at this level recruits with its Agent link (null = cannot recruit agents). */
    public function recruits(): ?self
    {
        return match ($this) {
            self::Agent => self::Master,
            self::Master => self::Silver,
            self::Silver => null,
        };
    }

    /** Default commission rate (basis points of the eligible platform fee). */
    public function defaultRateBps(): int
    {
        return match ($this) {
            self::Agent => 5000,
            self::Master => 4000,
            self::Silver => 3000,
        };
    }
}
