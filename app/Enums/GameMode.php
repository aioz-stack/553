<?php

namespace App\Enums;

/**
 * How a room is played.
 *
 *  - classic:    one deal, four players, pairwise ±1 scoring, payout_mode decides the pot.
 *  - round_bank: 12-round match; the banker seat rotates to the next eligible player every round.
 *  - banker:     12-round match; the table creator banks every round (replacement rule applies).
 *
 * In both banker modes every player plays only against the banker and
 * settles per round from the lane table in config('pusoy.banker.settlement').
 */
enum GameMode: string
{
    case Classic = 'classic';
    case RoundBank = 'round_bank';
    case Banker = 'banker';

    public function hasBanker(): bool
    {
        return $this !== self::Classic;
    }

    public function label(): string
    {
        return match ($this) {
            self::Classic => 'Classic',
            self::RoundBank => 'Round Bank',
            self::Banker => 'Banker Mode',
        };
    }
}
