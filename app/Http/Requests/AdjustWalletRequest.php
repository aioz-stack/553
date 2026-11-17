<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AdjustWalletRequest extends FormRequest
{
    use AmountRules;

    public function authorize(): bool
    {
        return (bool) $this->user()?->isSuperAdmin();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'wallet_id' => ['required', 'integer', 'exists:wallets,id'],
            'direction' => ['required', 'in:credit,debit'],
            'amount' => $this->amountRule(),
            'reason' => ['required', 'string', 'min:5', 'max:255'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
        ];
    }
}
