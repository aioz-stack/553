<?php

namespace App\Support;

/**
 * The cartoon avatar collection (images in the mobile app: public/avatars/{id}.webp).
 * Ids are stable: boy-01…boy-09, girl-01…girl-10, animal-01…animal-10. A player who has not
 * chosen one gets a default picked from their id, so every player always has a valid avatar.
 */
final class Avatars
{
    public const CATEGORIES = ['boy' => 9, 'girl' => 10, 'animal' => 10];

    /** @return list<string> */
    public static function ids(): array
    {
        $ids = [];
        foreach (self::CATEGORIES as $category => $count) {
            for ($i = 1; $i <= $count; $i++) {
                $ids[] = sprintf('%s-%02d', $category, $i);
            }
        }

        return $ids;
    }

    public static function valid(?string $id): bool
    {
        return $id !== null && in_array($id, self::ids(), true);
    }

    /** The avatar to show: the chosen one when valid, else a stable default for the player. */
    public static function for(?string $chosen, int $userId): string
    {
        if (self::valid($chosen)) {
            return $chosen;
        }
        $ids = self::ids();

        return $ids[$userId % count($ids)];
    }
}
