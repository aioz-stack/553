<?php

namespace App\Enums;

enum SettlementStatus: string
{
    case Pending = 'pending';
    case Settled = 'settled';
    case Failed = 'failed';
    case Refunded = 'refunded';
}
