<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'min:3', 'max:32', 'alpha_dash', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:32'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
            // A referral code (the ?ref= of a registration link; older agent codes are accepted too).
            'referral_code' => ['nullable', 'string', 'max:24', 'required_if:account_type,agent'],
            // player (default) or agent (Agent Registration Link: the level comes from the sponsor).
            'account_type' => ['nullable', 'in:player,agent'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ];
    }
}
