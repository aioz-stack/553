<?php

namespace App\Enums;

enum WalletType: string
{
    case Player = 'player';
    case Allocation = 'allocation';
    case Commission = 'commission';
    /**
     * Revenue wallet (Chips currency) of Admins, Incorporators and Master Agents: their Shop revenue
     * shares collect here and are moved into their Chips by Self Convert Revenue to Chips.
     */
    case Share = 'share';
    case Platform = 'platform';
    case Escrow = 'escrow';
}
