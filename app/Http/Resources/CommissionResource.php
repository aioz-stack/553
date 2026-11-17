<?php

namespace App\Http\Resources;

use App\Models\AgentCommission;
use App\Support\Points;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin AgentCommission
 */
class CommissionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'agent' => $this->whenLoaded('agent', fn () => ['id' => $this->agent->id, 'code' => $this->agent->code, 'name' => $this->agent->user?->name]),
            'player' => $this->whenLoaded('player', fn () => $this->player?->only(['id', 'name', 'username'])),
            'game_session_id' => $this->game_session_id,
            'currency' => $this->currency->value,
            'fee_basis' => Points::decimal($this->fee_basis),
            'rate_bps' => $this->rate_bps,
            'rate_percent' => $this->rate_bps / 100,
            'amount' => Points::decimal($this->amount),
            'status' => $this->status->value,
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'note' => $this->note,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
