<?php

namespace App\Models;

use App\Enums\Currency;
use App\Enums\GameMode;
use App\Enums\PayoutMode;
use App\Enums\RoomStatus;
use App\Enums\RoomVisibility;
use App\Enums\TieHandling;
use App\Enums\TimeoutPolicy;
use Database\Factories\GameRoomFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GameRoom extends Model
{
    /** @use HasFactory<GameRoomFactory> */
    use HasFactory;

    protected $guarded = ['id', 'carry_over_amount'];

    /** A lobby password is only ever stored hashed and never sent to clients. */
    protected $hidden = ['lobby_password'];

    /**
     * Same defaults as the migration, so unsaved/new models behave alike.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'game_mode' => 'classic',
        'rounds_total' => 12,
        'betting_seconds' => 15,
        'lucky_hands_enabled' => true,
    ];

    protected function casts(): array
    {
        return [
            'currency' => Currency::class,
            'payout_mode' => PayoutMode::class,
            'tie_handling' => TieHandling::class,
            'timeout_policy' => TimeoutPolicy::class,
            'visibility' => RoomVisibility::class,
            'status' => RoomStatus::class,
            'entry_amount' => 'integer',
            'point_value' => 'integer',
            'platform_fee_bps' => 'integer',
            'carry_over_amount' => 'integer',
            'allow_foul_submission' => 'boolean',
            'game_mode' => GameMode::class,
            'max_bet' => 'integer',
            'rounds_total' => 'integer',
            'betting_seconds' => 'integer',
            'lucky_hands_enabled' => 'boolean',
            'min_entry' => 'integer',
            'owner_starts' => 'boolean',
        ];
    }

    public function maxBet(): int
    {
        return $this->max_bet ?? $this->entry_amount * (int) config('pusoy.banker.max_bet_multiple', 10);
    }

    public function tables(): HasMany
    {
        return $this->hasMany(GameTable::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(GameSession::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(GameInvitation::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', RoomStatus::Active->value);
    }

    /** Player-created multiplayer lobbies (they have a Lobby ID). */
    public function scopeLobby(Builder $query): Builder
    {
        return $query->whereNotNull('lobby_code');
    }

    public function isLobby(): bool
    {
        return $this->lobby_code !== null;
    }

    /** Private lobby = created with a password. */
    public function isPrivateLobby(): bool
    {
        return $this->lobby_password !== null;
    }

    public function scopePublic(Builder $query): Builder
    {
        return $query->where('visibility', RoomVisibility::Public->value);
    }

    /**
     * Configuration snapshot copied into every game session so later room
     * edits never change an active or completed game.
     *
     * @return array<string, mixed>
     */
    public function snapshot(): array
    {
        return [
            'room_id' => $this->id,
            'name' => $this->name,
            'currency' => $this->currency->value,
            'entry_amount' => $this->entry_amount,
            'payout_mode' => $this->payout_mode->value,
            'platform_fee_bps' => $this->platform_fee_bps,
            'point_value' => $this->point_value ?? intdiv($this->entry_amount, 9),
            'arrangement_seconds' => $this->arrangement_seconds,
            'tie_handling' => $this->tie_handling->value,
            'timeout_policy' => $this->timeout_policy->value,
            'allow_foul_submission' => $this->allow_foul_submission,
            'seats' => 4,
            'game_mode' => $this->game_mode->value,
            'rounds_total' => $this->game_mode->hasBanker() ? $this->rounds_total : 1,
            'min_bet' => $this->entry_amount,
            'max_bet' => $this->maxBet(),
            'betting_seconds' => $this->betting_seconds,
            'lucky_hands_enabled' => $this->lucky_hands_enabled,
            'banker' => $this->game_mode->hasBanker() ? [
                'settlement' => config('pusoy.banker.settlement'),
                'reserve_multiplier' => (int) config('pusoy.banker.reserve_multiplier'),
                'lucky_multiplier' => (int) config('pusoy.banker.lucky_multiplier'),
                'foul' => 'fouled_hand_loses_every_lane_vs_valid_hand',
                'fee' => 'platform_fee_bps_of_each_positive_net_win',
            ] : null,
            'scoring' => [
                'win' => config('pusoy.game.score_win'),
                'loss' => config('pusoy.game.score_loss'),
                'tie' => config('pusoy.game.score_tie'),
                'foul' => 'loses_all_three_vs_each_non_fouled_opponent',
            ],
        ];
    }
}
