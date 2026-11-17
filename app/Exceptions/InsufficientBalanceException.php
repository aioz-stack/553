<?php

namespace App\Exceptions;

class InsufficientBalanceException extends BusinessRuleException
{
    public function __construct(string $message = 'Insufficient balance.')
    {
        parent::__construct($message, 422, 'insufficient_balance');
    }
}
