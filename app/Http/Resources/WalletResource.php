<?php

namespace App\Http\Resources;

use App\Models\Wallet;
use App\Support\Points;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Wallet
 */
class WalletResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'owner' => $this->whenLoaded('user', fn () => $this->user ? ['id' => $this->user->id, 'name' => $this->user->name, 'role' => $this->user->role->value] : ['system' => $this->system_key]),
            'currency' => $this->currency->value,
            'type' => $this->type->value,
            'balance' => Points::decimal($this->balance),
            'balance_minor' => $this->balance,
            'is_frozen' => $this->is_frozen,
            'withdrawable' => false,
        ];
    }
}
