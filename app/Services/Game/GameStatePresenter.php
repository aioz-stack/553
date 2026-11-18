<?php

namespace App\Services\Game;

use App\Enums\GameStatus;
use App\Game\LuckyHand;
use App\Models\GameBet;
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
    public function __construct(
        private readonly GameEngine $engine,
        private readonly TableService $tables,
        private readonly BankerMatchService $match,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function table(GameTable $table, User $viewer): array
    {
        $table->loadMissing('room');
        $room = $table->room;

        $banker = $table->hasBanker();

        return [
            'id' => $table->id,
            'status' => $table->status->value,
            'full_at' => $table->full_at?->toIso8601String(),
            'game_mode' => $table->game_mode->value,
            'rounds_total' => $table->rounds_total,
            'rounds_played' => $table->rounds_played,
            'banker_user_id' => $table->banker_user_id,
            'creator_user_id' => $table->creator_user_id,
            'next_round_at' => $table->next_round_at?->toIso8601String(),
            'end_reason' => $table->end_reason,
            'min_players' => $banker ? $this->match->minPlayers($table) : 4,
            'room' => [
                'id' => $room->id,
                'name' => $room->name,
                'currency' => $room->currency->value,
                'entry_amount' => Points::decimal($room->entry_amount),
                'payout_mode' => $room->payout_mode->value,
                'game_mode' => $room->game_mode->value,
                'arrangement_seconds' => $room->arrangement_seconds,
                'min_bet' => Points::decimal($room->entry_amount),
                'max_bet' => Points::decimal($room->maxBet()),
                'lucky_hands_enabled' => $room->lucky_hands_enabled,
                'is_hosted' => $room->owner_id !== null,
                'invite_code' => $room->owner_id === $viewer->id ? $room->invite_code : null,
            ],
            'players' => GamePlayer::query()->with('user.profile')->where('game_table_id', $table->id)->orderBy('seat')->get()
                ->map(fn (GamePlayer $p) => $this->tables->summary($p) + [
                    'is_you' => $p->user_id === $viewer->id,
                    'is_banker' => $banker && $p->user_id === $table->banker_user_id,
                    'banker_rounds' => $p->banker_rounds,
                ])->values(),
            'current_session_id' => $table->current_session_id,
            'ready_timeout_seconds' => (int) config('pusoy.game.ready_timeout_seconds'),
            'standings' => $banker ? $this->match->standings($table) : null,
            'my_banker_rounds_left' => $banker ? $this->match->remainingBankerRounds($table, $viewer->id) : 0,
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

        $isBanker = $session->isBankerRound();
        $bets = $isBanker ? GameBet::query()->where('game_session_id', $session->id)->pluck('amount', 'user_id') : collect();
        $luckyIds = $isBanker ? GameSubmission::query()->where('game_session_id', $session->id)->whereNotNull('lucky_type')->pluck('user_id')->all() : [];

        // Before the deal (betting) the round's players are the banker plus the
        // eligible participants; afterwards, whoever was dealt cards.
        $roster = GameCard::query()->with('user.profile')->where('game_session_id', $session->id)->orderBy('seat')->get()
            ->map(fn (GameCard $c) => ['user' => $c->user, 'seat' => $c->seat]);

        if ($roster->isEmpty() && $isBanker) {
            $ids = [$session->banker_user_id, ...($config['participants'] ?? [])];
            $roster = GamePlayer::query()->with('user.profile')->where('game_table_id', $session->game_table_id)->whereIn('user_id', $ids)->orderBy('seat')->get()
                ->map(fn (GamePlayer $p) => ['user' => $p->user, 'seat' => $p->seat]);
        }

        $players = $roster->map(function (array $row) use ($viewer, $submittedIds, $session, $bets, $luckyIds) {
            $user = $row['user'];
            $seat = GamePlayer::query()->where('game_table_id', $session->game_table_id)->where('user_id', $user->id)->first();

            return [
                'user_id' => $user->id,
                'name' => $user->profile?->display_name ?? $user->name,
                'avatar' => $user->avatarId(),
                'seat' => $row['seat'],
                'is_you' => $user->id === $viewer->id,
                'has_submitted' => in_array($user->id, $submittedIds, true),
                'is_connected' => $seat?->is_connected ?? false,
                'is_banker' => $session->banker_user_id === $user->id,
                'bet' => isset($bets[$user->id]) ? Points::decimal((int) $bets[$user->id]) : null,
                // A declaration is announced live; its cards stay hidden until the reveal.
                'declared_lucky' => in_array($user->id, $luckyIds, true),
            ];
        })->values();

        $myLucky = null;

        if ($isBanker && $myCards && ! $mySubmission && $session->status === GameStatus::Arranging && ($config['lucky_hands_enabled'] ?? true)) {
            $found = LuckyHand::detect($myCards->cards);
            $myLucky = $found ? ['type' => $found['type'], 'label' => $found['label']] : null;
        }

        return [
            'id' => $session->id,
            'table_id' => $session->game_table_id,
            'status' => $session->status->value,
            'server_time' => now()->toIso8601String(),
            'arrangement_deadline' => $session->arrangement_deadline?->toIso8601String(),
            'seconds_remaining' => $session->status === GameStatus::Arranging && $session->arrangement_deadline
                ? max(0, (int) now()->diffInSeconds($session->arrangement_deadline, false))
                : 0,
            'betting_deadline' => $session->betting_deadline?->toIso8601String(),
            'betting_seconds_remaining' => $session->status === GameStatus::Betting && $session->betting_deadline
                ? max(0, (int) now()->diffInSeconds($session->betting_deadline, false))
                : 0,
            'round_number' => $session->round_number,
            'banker_user_id' => $session->banker_user_id,
            'my_bet' => isset($bets[$viewer->id]) ? Points::decimal((int) $bets[$viewer->id]) : null,
            'my_lucky' => $myLucky,
            'can_bet' => $isBanker && $session->status === GameStatus::Betting && $viewer->id !== $session->banker_user_id
                && in_array($viewer->id, $config['participants'] ?? [], true) && ! isset($bets[$viewer->id]),
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
                'game_mode' => $config['game_mode'] ?? 'classic',
                'rounds_total' => $config['rounds_total'] ?? 1,
                'min_bet' => Points::decimal((int) ($config['min_bet'] ?? $config['entry_amount'])),
                'max_bet' => Points::decimal((int) ($config['max_bet'] ?? $config['entry_amount'])),
                'betting_seconds' => $config['betting_seconds'] ?? null,
                'lucky_hands_enabled' => (bool) ($config['lucky_hands_enabled'] ?? false),
                'settlement' => $config['banker']['settlement'] ?? null,
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
                'lucky_type' => $mySubmission->lucky_type,
            ] : null,
            'arrangements' => $revealed ? $this->engine->revealedArrangements($session) : null,
            'results' => $session->status === GameStatus::Completed ? array_map(fn (array $r) => array_merge($r, [
                'entry' => Points::decimal($r['entry']),
                'payout' => Points::decimal($r['payout']),
                'net' => Points::decimal($r['net']),
                'bet' => Points::decimal((int) $r['bet']),
                'lucky_bonus' => Points::decimal((int) $r['lucky_bonus']),
                'fee' => Points::decimal((int) $r['fee']),
            ]), $this->engine->publicResults($session)) : null,
            'cancel_reason' => $session->cancel_reason,
        ];
    }
}
