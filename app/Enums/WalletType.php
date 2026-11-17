<?php

namespace App\Enums;

enum WalletType: string
{
    case Player = 'player';
    case Allocation = 'allocation';
    case Commission = 'commission';
    case Platform = 'platform';
    case Escrow = 'escrow';
}
