<?php

namespace App\Services\Game;

use App\Enums\GameStatus;
use App\Models\GameCard;
use App\Models\GamePlayer;
use App\Models\GameSession;
use App\Models\GameSubmission;
use App\Models\GameTable;
use App\Models\User;
use App\Support\Points;

/**
 * Builds the per-viewer game state used for initial load AND reconnection
 * recovery. Visibility rules:
 *  - a player sees their own 13 cards and own submission at any time;
 *  - other players' arrangements are included only from REVEALING onwards;
 *  - the shuffle seed is included only after completion/cancellation;
 *  - no wallet balances are included.
 */
class GameStatePresenter
{
    public function __construct(private readonly GameEngine $engine, private readonly TableService $tables) {}

    /**
     * @return array<string, mixed>
     */
    public function table(GameTable $table, User $viewer): array
    {
        $table->loadMissing('room');
        $room = $table->room;

        return [
            'id' => $table->id,
            'status' => $table->status->value,
            'full_at' => $table->full_at?->toIso8601String(),
            'room' => [
                'id' => $room->id,
                'name' => $room->name,
                'currency' => $room->currency->value,
                'entry_amount' => Points::decimal($room->entry_amount),
                'payout_mode' => $room->payout_mode->value,
                'arrangement_seconds' => $room->arrangement_seconds,
            ],
            'players' => GamePlayer::query()->with('user.profile')->where('game_table_id', $table->id)->orderBy('seat')->get()
                ->map(fn (GamePlayer $p) => $this->tables->summary($p) + ['is_you' => $p->user_id === $viewer->id])->values(),
            'current_session_id' => $table->current_session_id,
            'ready_timeout_seconds' => (int) config('pusoy.game.ready_timeout_seconds'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function session(GameSession $session, User $viewer): array
    {
        $revealed = $session->status->isRevealed();
        $submittedIds = GameSubmission::query()->where('game_session_id', $session->id)->pluck('user_id')->all();
        $myCards = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $viewer->id)->first();
        $mySubmission = GameSubmission::query()->where('game_session_id', $session->id)->where('user_id', $viewer->id)->first();
        $config = $session->config;

        $players = GameCard::query()->with('user.profile')->where('game_session_id', $session->id)->orderBy('seat')->get()
            ->map(function (GameCard $card) use ($viewer, $submittedIds, $session) {
                $seat = GamePlayer::query()->where('game_table_id', $session->game_table_id)->where('user_id', $card->user_id)->first();

                return [
                    'user_id' => $card->user_id,
                    'name' => $card->user->profile?->display_name ?? $card->user->name,
                    'seat' => $card->seat,
                    'is_you' => $card->user_id === $viewer->id,
                    'has_submitted' => in_array($card->user_id, $submittedIds, true),
                    'is_connected' => $seat?->is_connected ?? false,
                ];
            })->values();

        return [
            'id' => $session->id,
            'table_id' => $session->game_table_id,
            'status' => $session->status->value,
            'server_time' => now()->toIso8601String(),
            'arrangement_deadline' => $session->arrangement_deadline?->toIso8601String(),
            'seconds_remaining' => $session->status === GameStatus::Arranging && $session->arrangement_deadline
                ? max(0, (int) now()->diffInSeconds($session->arrangement_deadline, false))
                : 0,
            'deck_commitment' => $session->deck_commitment,
            'server_seed' => $session->seed_revealed ? $session->server_seed : null,
            'config' => [
                'room_name' => $config['name'],
                'currency' => $config['currency'],
                'entry_amount' => Points::decimal((int) $config['entry_amount']),
                'payout_mode' => $config['payout_mode'],
                'platform_fee_bps' => $config['platform_fee_bps'],
                'tie_handling' => $config['tie_handling'],
                'timeout_policy' => $config['timeout_policy'],
                'allow_foul_submission' => $config['allow_foul_submission'],
                'arrangement_seconds' => $config['arrangement_seconds'],
            ],
            'pot' => Points::decimal($session->pot),
            'players' => $players,
            'is_participant' => $myCards !== null,
            'my_cards' => $myCards?->cards,
            'my_submission' => $mySubmission ? [
                'front' => $mySubmission->front,
                'middle' => $mySubmission->middle,
                'back' => $mySubmission->back,
                'is_auto' => $mySubmission->is_auto,
            ] : null,
            'arrangements' => $revealed ? $this->engine->revealedArrangements($session) : null,
            'results' => $session->status === GameStatus::Completed ? array_map(fn (array $r) => array_merge($r, [
                'entry' => Points::decimal($r['entry']),
                'payout' => Points::decimal($r['payout']),
                'net' => Points::decimal($r['net']),
            ]), $this->engine->publicResults($session)) : null,
            'cancel_reason' => $session->cancel_reason,
        ];
    }
}
