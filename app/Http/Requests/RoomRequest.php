<?php

namespace App\Http\Requests;

use App\Enums\Currency;
use App\Enums\PayoutMode;
use App\Enums\RoomStatus;
use App\Enums\RoomVisibility;
use App\Enums\TieHandling;
use App\Enums\TimeoutPolicy;
use App\Support\Points;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class RoomRequest extends FormRequest
{
    use AmountRules;

    public function authorize(): bool
    {
        return (bool) $this->user()?->can('manage_rooms');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:1000'],
            'currency' => ['required', Rule::enum(Currency::class)],
            'entry_amount' => $this->amountRule(),
            'payout_mode' => ['required', Rule::enum(PayoutMode::class)],
            'platform_fee_bps' => ['required', 'integer', 'min:0', 'max:3000'],
            'point_value' => $this->amountRule(false),
            // Pusoy 13 tables always seat exactly four.
            'max_players' => ['nullable', 'integer', 'in:4'],
            'min_players' => ['nullable', 'integer', 'in:4'],
            'arrangement_seconds' => ['required', 'integer', 'min:30', 'max:600'],
            'tie_handling' => ['required', Rule::enum(TieHandling::class)],
            'timeout_policy' => ['required', Rule::enum(TimeoutPolicy::class)],
            'allow_foul_submission' => ['boolean'],
            'visibility' => ['required', Rule::enum(RoomVisibility::class)],
            'status' => ['required', Rule::enum(RoomStatus::class)],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($validator->errors()->isNotEmpty() || ! $this->filled('point_value')) {
                    return;
                }

                // Round bank: max loss is 9 points, so point value ≤ entry / 9.
                if (Points::toMinor($this->input('point_value')) > intdiv(Points::toMinor($this->input('entry_amount')), 9)) {
                    $validator->errors()->add('point_value', 'Point value may not exceed the entry amount divided by 9.');
                }
            },
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toAttributes(): array
    {
        $data = $this->validated();

        return [
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'currency' => $data['currency'],
            'entry_amount' => Points::toMinor($data['entry_amount']),
            'payout_mode' => $data['payout_mode'],
            'platform_fee_bps' => $data['platform_fee_bps'],
            'point_value' => isset($data['point_value']) ? Points::toMinor($data['point_value']) : null,
            'max_players' => 4,
            'min_players' => 4,
            'arrangement_seconds' => $data['arrangement_seconds'],
            'tie_handling' => $data['tie_handling'],
            'timeout_policy' => $data['timeout_policy'],
            'allow_foul_submission' => (bool) ($data['allow_foul_submission'] ?? false),
            'visibility' => $data['visibility'],
            'status' => $data['status'],
            'slug' => Str::slug($data['name']).'-'.Str::lower(Str::random(4)),
        ];
    }
}
