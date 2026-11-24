<?php

namespace App\Enums;

/**
 * Agent levels, top to bottom: Administrator → Incorporator (agent) → Master Agent → Players.
 * The Administrator's Agent Registration Link creates Incorporators, an Incorporator's creates
 * Master Agents; every agent level registers Players with its Player Registration Link.
 * (Silver Agent was removed: existing ones became Master Agents — see the 2026_11_25_160000 migration.)
 */
enum AgentLevel: string
{
    case Agent = 'agent';
    case Master = 'master';

    public function label(): string
    {
        return match ($this) {
            self::Agent => 'Incorporator',
            self::Master => 'Master Agent',
        };
    }

    /** The level an account at this level recruits with its Agent link (null = cannot recruit agents). */
    public function recruits(): ?self
    {
        return match ($this) {
            self::Agent => self::Master,
            self::Master => null,
        };
    }

    /** Default commission rate (basis points of the eligible platform fee). */
    public function defaultRateBps(): int
    {
        return match ($this) {
            self::Agent => 5000,
            self::Master => 4000,
        };
    }
}
