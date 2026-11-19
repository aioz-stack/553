<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Super Admin manual point deposit (credit) or withdrawal (debit). Targets
 * either an existing wallet (wallet_id) or a user + currency, in which case
 * the user's player wallet (players) or allocation wallet (staff) is used.
 * Points only: no real money moves.
 */
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
            'wallet_id' => ['required_without:user_id', 'nullable', 'integer', 'exists:wallets,id'],
            'user_id' => ['required_without:wallet_id', 'nullable', 'integer', 'exists:users,id'],
            'currency' => ['required_with:user_id', 'nullable', 'in:GD,CH'],
            'direction' => ['required', 'in:credit,debit'],
            'amount' => $this->amountRule(),
            'reason' => ['required', 'string', 'min:5', 'max:255'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
        ];
    }
}
