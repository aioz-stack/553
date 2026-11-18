<?php

namespace App\Http\Resources;

use App\Models\GameSession;
use App\Support\Points;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Summary row for history / admin lists. Never includes cards.
 *
 * @mixin GameSession
 */
class GameSessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $viewerId = $request->user()?->id;
        $mine = $this->relationLoaded('results') ? $this->results->firstWhere('user_id', $viewerId) : null;

        return [
            'id' => $this->id,
            'table_id' => $this->game_table_id,
            'room' => ['id' => $this->game_room_id, 'name' => $this->config['name'] ?? null],
            'status' => $this->status->value,
            'currency' => $this->currency->value,
            'payout_mode' => $this->config['payout_mode'] ?? null,
            'pot' => Points::decimal($this->pot),
            'platform_fee' => Points::decimal($this->platform_fee),
            'deck_commitment' => $this->deck_commitment,
            'started_at' => $this->started_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'cancel_reason' => $this->cancel_reason,
            'players' => $this->whenLoaded('results', fn () => $this->results->map(fn ($r) => [
                'user_id' => $r->user_id,
                'name' => $r->user?->name,
                'avatar' => $r->user?->avatarId(),
                'score' => $r->score,
                'placement' => $r->placement,
                'net' => Points::decimal($r->net_amount),
            ])->values()),
            'my_result' => $mine ? [
                'score' => $mine->score,
                'placement' => $mine->placement,
                'payout' => Points::decimal($mine->payout_amount),
                'net' => Points::decimal($mine->net_amount),
                'is_foul' => $mine->is_foul,
            ] : null,
        ];
    }
}
