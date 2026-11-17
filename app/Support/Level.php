<?php

namespace App\Support;

/**
 * Player level from experience points. Every level needs
 * `per_level × level` more XP than the last (100, 200, 300, ...).
 */
final class Level
{
    /**
     * @return array{level: int, xp: int, into_level: int, for_next: int}
     */
    public static function fromXp(int $xp): array
    {
        $step = max(1, (int) config('pusoy.xp.per_level', 100));
        $level = 1;
        $floor = 0;

        while ($xp >= $floor + $step * $level) {
            $floor += $step * $level;
            $level++;
        }

        return ['level' => $level, 'xp' => $xp, 'into_level' => $xp - $floor, 'for_next' => $step * $level];
    }
}
