<?php

namespace App\Enums;

enum WalletType: string
{
    case Player = 'player';
    case Allocation = 'allocation';
    case Commission = 'commission';
    /** History only: Share Amount wallets of the retired "Convert to Chips" feature (emptied into Chips). */
    case Share = 'share';
    case Platform = 'platform';
    case Escrow = 'escrow';
}
