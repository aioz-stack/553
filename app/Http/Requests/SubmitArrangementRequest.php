<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Shape validation only; card ownership, duplicates and foul rules are
 * validated server-side by the game engine.
 */
class SubmitArrangementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'front' => ['required', 'array', 'size:3'],
            'front.*' => ['required', 'string', 'size:2'],
            'middle' => ['required', 'array', 'size:5'],
            'middle.*' => ['required', 'string', 'size:2'],
            'back' => ['required', 'array', 'size:5'],
            'back.*' => ['required', 'string', 'size:2'],
        ];
    }
}
