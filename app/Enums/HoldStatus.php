<?php

namespace App\Enums;

enum HoldStatus: string
{
    case Held = 'held';
    case Captured = 'captured';
    case Released = 'released';
}
