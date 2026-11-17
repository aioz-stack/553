<?php

namespace App\Enums;

enum PayoutMode: string
{
    case RoundBank = 'round_bank';
    case WinnerTakesAll = 'winner_takes_all';
}
