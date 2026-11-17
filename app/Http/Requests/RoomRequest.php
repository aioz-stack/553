<?php

namespace App\Http\Requests;

use App\Enums\Currency;
use App\Enums\GameMode;
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
            'game_mode' => ['nullable', Rule::enum(GameMode::class)],
            // Banker modes: rounds per match, bet range (entry_amount = minimum bet), betting timer.
            'rounds_total' => ['nullable', 'integer', 'min:1', 'max:24'],
            'max_bet' => $this->amountRule(false),
            'betting_seconds' => ['nullable', 'integer', 'min:5', 'max:120'],
            'lucky_hands_enabled' => ['boolean'],
            // Tables seat four. Classic needs all four; banker modes can start with 2–4.
            'max_players' => ['nullable', 'integer', 'in:4'],
            'min_players' => ['nullable', 'integer', 'min:2', 'max:4'],
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
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                if ($this->filled('max_bet') && Points::toMinor($this->input('max_bet')) < Points::toMinor($this->input('entry_amount'))) {
                    $validator->errors()->add('max_bet', 'Maximum bet must be at least the minimum bet (entry amount).');
                }

                if (! $this->filled('point_value')) {
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
            'game_mode' => $mode = ($data['game_mode'] ?? GameMode::Classic->value),
            'rounds_total' => $mode === GameMode::Classic->value ? 1 : (int) ($data['rounds_total'] ?? config('pusoy.banker.rounds', 12)),
            'max_bet' => isset($data['max_bet']) ? Points::toMinor($data['max_bet']) : null,
            'betting_seconds' => (int) ($data['betting_seconds'] ?? config('pusoy.banker.default_betting_seconds', 15)),
            'lucky_hands_enabled' => (bool) ($data['lucky_hands_enabled'] ?? true),
            'max_players' => 4,
            'min_players' => $mode === GameMode::Classic->value ? 4 : (int) ($data['min_players'] ?? 2),
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
