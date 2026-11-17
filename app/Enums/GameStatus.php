<?php

namespace App\Enums;

enum GameStatus: string
{
    case WaitingForPlayers = 'WAITING_FOR_PLAYERS';
    case Ready = 'READY';
    case Betting = 'BETTING';
    case Dealing = 'DEALING';
    case Arranging = 'ARRANGING';
    case Submitted = 'SUBMITTED';
    case Revealing = 'REVEALING';
    case Scoring = 'SCORING';
    case Completed = 'COMPLETED';
    case Cancelled = 'CANCELLED';

    /**
     * Statuses after which every arrangement may be shown to every player.
     */
    public function isRevealed(): bool
    {
        return in_array($this, [self::Revealing, self::Scoring, self::Completed], true);
    }

    public function isFinal(): bool
    {
        return in_array($this, [self::Completed, self::Cancelled], true);
    }
}
