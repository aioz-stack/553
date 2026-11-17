<?php

namespace App\Http\Requests;

/**
 * Amounts arrive as decimal strings ("2000", "12.50") and are converted to
 * minor units with App\Support\Points::toMinor().
 */
trait AmountRules
{
    /**
     * @return list<string>
     */
    protected function amountRule(bool $required = true): array
    {
        return [$required ? 'required' : 'nullable', 'regex:/^\d{1,13}(\.\d{1,2})?$/', 'not_in:0,0.0,0.00'];
    }
}
