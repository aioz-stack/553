<?php

namespace App\Http\Requests;

use App\Enums\Currency;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Authorization (who may allocate to whom) is enforced in AllocationService.
 */
class AllocatePointsRequest extends FormRequest
{
    use AmountRules;

    public function authorize(): bool
    {
        return $this->user() !== null && ! $this->user()->isPlayer();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'recipient_id' => ['required', 'integer', 'exists:users,id'],
            'currency' => ['required', Rule::enum(Currency::class)],
            'amount' => $this->amountRule(),
            'reason' => ['nullable', 'string', 'max:255'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
        ];
    }
}
