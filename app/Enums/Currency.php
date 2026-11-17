<?php

namespace App\Enums;

enum Currency: string
{
    case CP = 'CP';
    case VC = 'VC';

    /**
     * VC is free-play only: never withdrawable, redeemable or convertible.
     */
    public function isCash(): bool
    {
        return $this === self::CP;
    }
}
