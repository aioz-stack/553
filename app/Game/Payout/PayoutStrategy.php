<?php

namespace App\Game\Payout;

interface PayoutStrategy
{
    public function calculate(PayoutInput $input): PayoutResult;
}
