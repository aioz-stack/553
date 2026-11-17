<?php

namespace App\Enums;

enum TieHandling: string
{
    case SplitEqually = 'split_equally';
    case CarryForward = 'carry_forward';
    case TieBreaker = 'tie_breaker';
}
