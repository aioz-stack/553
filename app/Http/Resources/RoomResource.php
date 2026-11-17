<?php

namespace App\Http\Resources;

use App\Enums\TableStatus;
use App\Models\GameRoom;
use App\Support\Points;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin GameRoom
 */
class RoomResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $staff = $request->user()?->can('manage_rooms');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'currency' => $this->currency->value,
            'entry_amount' => Points::decimal($this->entry_amount),
            'payout_mode' => $this->payout_mode->value,
            'platform_fee_bps' => $this->platform_fee_bps,
            'point_value' => $this->point_value !== null ? Points::decimal($this->point_value) : null,
            'max_players' => $this->max_players,
            'min_players' => $this->min_players,
            'arrangement_seconds' => $this->arrangement_seconds,
            'tie_handling' => $this->tie_handling->value,
            'timeout_policy' => $this->timeout_policy->value,
            'allow_foul_submission' => $this->allow_foul_submission,
            'visibility' => $this->visibility->value,
            'status' => $this->status->value,
            'carry_over' => Points::decimal((int) $this->carry_over_amount),
            'invite_code' => $this->when($staff || $request->user()?->id === $this->owner_id, $this->invite_code),
            'waiting_players' => $this->whenLoaded('tables', fn () => $this->tables
                ->whereIn('status', [TableStatus::WaitingForPlayers, TableStatus::Ready])
                ->sum(fn ($t) => $t->players_count ?? $t->players->count())),
            'active_tables' => $this->whenLoaded('tables', fn () => $this->tables->where('status', TableStatus::InGame)->count()),
            'game_mode' => $this->game_mode->value,
            'game_mode_label' => $this->game_mode->label(),
            'rounds_total' => $this->game_mode->hasBanker() ? $this->rounds_total : 1,
            'min_bet' => Points::decimal($this->entry_amount),
            'max_bet' => Points::decimal($this->maxBet()),
            'betting_seconds' => $this->betting_seconds,
            'lucky_hands_enabled' => $this->lucky_hands_enabled,
            'is_hosted' => $this->owner_id !== null,
            'host' => $this->when($this->owner_id !== null && $this->relationLoaded('owner'), fn () => $this->owner?->only(['id', 'username', 'name'])),
            // Players seated at tables that can still take a seat (banker matches accept mid-match joins).
            'seated_players' => $this->whenLoaded('tables', fn () => $this->tables
                ->where('status', '!=', TableStatus::Closed)
                ->sum(fn ($t) => $t->players_count ?? $t->players->count())),
            'enabled' => $this->currency->value === 'VC' || (bool) config('pusoy.features.cp_wagering'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
