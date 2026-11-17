<?php

namespace App\Services\Game;

use App\Enums\GameStatus;
use App\Enums\HoldStatus;
use App\Enums\SettlementStatus;
use App\Enums\TableStatus;
use App\Enums\TimeoutPolicy;
use App\Enums\TransactionType;
use App\Events\Game\GameEvents;
use App\Events\Game\TableEvent;
use App\Events\Game\UserEvent;
use App\Exceptions\BusinessRuleException;
use App\Game\Arrangement;
use App\Game\ArrangementValidator;
use App\Game\AutoArranger;
use App\Game\Deck;
use App\Game\Exceptions\InvalidArrangementException;
use App\Game\Scorer;
use App\Jobs\ExpireArrangement;
use App\Jobs\ResolveGameSession;
use App\Models\GameCard;
use App\Models\GameHandResult;
use App\Models\GamePlayer;
use App\Models\GameResult;
use App\Models\GameSession;
use App\Models\GameSubmission;
use App\Models\GameTable;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Models\WalletHold;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Support\Facades\DB;

/**
 * Server-authoritative game state machine.
 *
 *   table:   WAITING_FOR_PLAYERS → READY (4 seated) → IN_GAME → CLOSED
 *   session: DEALING → ARRANGING → SUBMITTED → REVEALING → SCORING → COMPLETED
 *            (any non-final state) → CANCELLED (all entries refunded)
 *
 * Every transition happens under a row lock on the session (or table) and
 * re-checks the current state, so duplicate requests, retried jobs and the
 * scheduler sweep can all call these methods safely (idempotent).
 */
class GameEngine
{
    public function __construct(
        private readonly SettlementService $settlement,
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    public function start(GameTable $table): ?GameSession
    {
        return DB::transaction(function () use ($table) {
            $table = GameTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();
            $players = GamePlayer::query()->where('game_table_id', $table->id)->orderBy('seat')->get();

            if ($table->status !== TableStatus::Ready || $players->count() !== 4 || ! $players->every('is_ready')) {
                return null;
            }

            $room = $table->room;
            $config = $room->snapshot();
            $holds = WalletHold::query()->where('game_table_id', $table->id)->where('status', HoldStatus::Held->value)->whereNull('game_session_id')->get();

            $seed = Deck::newSeed();
            $deck = Deck::shuffled($seed);

            $session = GameSession::create([
                'game_table_id' => $table->id,
                'game_room_id' => $room->id,
                'status' => GameStatus::Dealing,
                'config' => $config,
                'currency' => $room->currency,
                'pot' => $holds->sum('amount'),
                'deck_commitment' => Deck::commitment($seed, $deck),
                'server_seed' => $seed,
            ]);

            $hands = Deck::deal($deck);

            foreach ($players as $player) {
                GameCard::create([
                    'game_session_id' => $session->id,
                    'user_id' => $player->user_id,
                    'seat' => $player->seat,
                    'cards' => $hands[$player->seat],
                ]);
            }

            WalletHold::query()->whereIn('id', $holds->pluck('id'))->update(['game_session_id' => $session->id]);

            $deadline = now()->addSeconds((int) $config['arrangement_seconds']);
            $session->forceFill(['status' => GameStatus::Arranging, 'started_at' => now(), 'arrangement_deadline' => $deadline])->save();
            $table->forceFill(['status' => TableStatus::InGame, 'current_session_id' => $session->id])->save();

            event(new TableEvent($table->id, GameEvents::GAME_STARTED, [
                'session_id' => $session->id,
                'deck_commitment' => $session->deck_commitment,
                'arrangement_deadline' => $deadline->toIso8601String(),
            ]));

            foreach ($players as $player) {
                event(new UserEvent($player->user_id, GameEvents::CARDS_DEALT, [
                    'session_id' => $session->id,
                    'table_id' => $table->id,
                    'cards' => $hands[$player->seat],
                ]));
            }

            $this->broadcastTimer($session);

            ExpireArrangement::dispatch($session->id)->delay($deadline)->afterCommit();

            return $session;
        });
    }

    /**
     * @param  mixed  $front
     * @param  mixed  $middle
     * @param  mixed  $back
     */
    public function submit(User $user, GameSession $session, $front, $middle, $back): GameSubmission
    {
        $submission = DB::transaction(function () use ($user, $session, $front, $middle, $back) {
            $session = GameSession::query()->whereKey($session->id)->lockForUpdate()->firstOrFail();
            $card = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $user->id)->first();

            if ($card === null) {
                throw new BusinessRuleException('You are not playing in this game.', 403, 'forbidden');
            }

            if (GameSubmission::query()->where('game_session_id', $session->id)->where('user_id', $user->id)->exists()) {
                throw new BusinessRuleException('You have already submitted your arrangement.', 409, 'already_submitted');
            }

            if ($session->status !== GameStatus::Arranging) {
                throw new BusinessRuleException('Submissions are closed for this game.', 409, 'invalid_state');
            }

            if ($session->arrangement_deadline->isPast()) {
                throw new BusinessRuleException('The arrangement timer has expired.', 409, 'timer_expired');
            }

            try {
                $arrangement = ArrangementValidator::build($card->cards, $front, $middle, $back);
            } catch (InvalidArrangementException $e) {
                throw new BusinessRuleException($e->getMessage(), 422, 'invalid_arrangement');
            }

            $isFoul = $arrangement->isFoul();

            if ($isFoul && ! ($session->config['allow_foul_submission'] ?? false)) {
                throw new BusinessRuleException('Fouled arrangement: Back must be at least as strong as Middle, and Middle at least as strong as Front.', 422, 'foul');
            }

            $submission = $this->storeSubmission($session, $user->id, $arrangement, $isFoul, false);

            $count = GameSubmission::query()->where('game_session_id', $session->id)->count();
            event(new TableEvent($session->game_table_id, GameEvents::PLAYER_SUBMITTED, ['session_id' => $session->id, 'user_id' => $user->id, 'submitted_count' => $count]));

            if ($count === 4) {
                $this->markAllSubmitted($session);
            }

            return $submission;
        });

        return $submission;
    }

    /**
     * Timer expiry: resolve every missing arrangement according to the
     * room's timeout policy, then move on to the reveal.
     */
    public function expire(GameSession $session, bool $force = false): void
    {
        DB::transaction(function () use ($session, $force) {
            $session = GameSession::query()->whereKey($session->id)->lockForUpdate()->firstOrFail();

            if ($session->status !== GameStatus::Arranging || (! $force && $session->arrangement_deadline->isFuture())) {
                return;
            }

            $submitted = GameSubmission::query()->where('game_session_id', $session->id)->pluck('user_id')->all();
            $policy = TimeoutPolicy::from($session->config['timeout_policy'] ?? 'auto_arrange');

            foreach (GameCard::query()->where('game_session_id', $session->id)->whereNotIn('user_id', $submitted)->get() as $card) {
                $this->storeSubmission($session, $card->user_id, AutoArranger::arrange($card->cards), $policy === TimeoutPolicy::Foul, true);
            }

            $this->markAllSubmitted($session);
        });
    }

    /**
     * Reveal → score → settle → complete. Resumable from any intermediate state.
     */
    public function resolve(GameSession $session): void
    {
        DB::transaction(function () use ($session) {
            $session = GameSession::query()->whereKey($session->id)->lockForUpdate()->firstOrFail();

            if ($session->status === GameStatus::Submitted) {
                $session->forceFill(['status' => GameStatus::Revealing, 'revealed_at' => now()])->save();
                event(new TableEvent($session->game_table_id, GameEvents::GAME_REVEALED, [
                    'session_id' => $session->id,
                    'arrangements' => $this->revealedArrangements($session),
                ]));
            }

            if ($session->status === GameStatus::Revealing) {
                $this->score($session);
                $session->forceFill(['status' => GameStatus::Scoring])->save();
                event(new TableEvent($session->game_table_id, GameEvents::SCORING_COMPLETED, [
                    'session_id' => $session->id,
                    'scores' => GameResult::query()->where('game_session_id', $session->id)->pluck('score', 'user_id'),
                ]));
            }
        });

        $session->refresh();

        if ($session->status !== GameStatus::Scoring) {
            return;
        }

        // Settlement is its own atomic, idempotent transaction. On failure the
        // session stays in SCORING and is retried by the job / sweep.
        $this->settlement->settle($session);

        DB::transaction(function () use ($session) {
            $session = GameSession::query()->whereKey($session->id)->lockForUpdate()->firstOrFail();

            if ($session->status !== GameStatus::Scoring) {
                return;
            }

            $session->forceFill(['status' => GameStatus::Completed, 'completed_at' => now(), 'seed_revealed' => true])->save();
            GameTable::query()->whereKey($session->game_table_id)->update(['status' => TableStatus::Closed->value, 'closed_at' => now()]);

            foreach (GameResult::query()->where('game_session_id', $session->id)->get() as $result) {
                $profile = PlayerProfile::query()->firstOrCreate(['user_id' => $result->user_id]);
                $profile->increment('games_played', 1, [
                    'games_won' => $profile->games_won + ($result->placement === 1 ? 1 : 0),
                    'total_score' => $profile->total_score + $result->score,
                ]);
            }

            event(new TableEvent($session->game_table_id, GameEvents::GAME_RESULTS, [
                'session_id' => $session->id,
                'results' => $this->publicResults($session),
                'server_seed' => $session->server_seed,
                'deck_commitment' => $session->deck_commitment,
            ]));
        });
    }

    /**
     * Cancel a game that has not completed. All entries are refunded and no
     * commissions are generated.
     */
    public function cancel(GameSession $session, ?User $actor, string $reason): void
    {
        DB::transaction(function () use ($session, $actor, $reason) {
            $session = GameSession::query()->whereKey($session->id)->lockForUpdate()->firstOrFail();

            if ($session->status->isFinal()) {
                throw new BusinessRuleException('This game is already finished.', 409, 'invalid_state');
            }

            foreach (WalletHold::query()->where('game_session_id', $session->id)->where('status', HoldStatus::Held->value)->lockForUpdate()->get() as $hold) {
                $refund = $this->ledger->transfer(new TransferRequest(
                    type: TransactionType::GameRefund,
                    currency: $hold->currency,
                    source: $this->wallets->escrow($hold->currency),
                    destination: $hold->wallet,
                    amount: $hold->amount,
                    reason: "Game #{$session->id} cancelled: {$reason}",
                    actor: $actor,
                    idempotencyKey: "refund:hold:{$hold->id}",
                    relatedPlayerId: $hold->user_id,
                    gameSessionId: $session->id,
                ));
                $hold->forceFill(['status' => HoldStatus::Released, 'release_transaction_id' => $refund->id])->save();
            }

            $session->settlement?->forceFill(['status' => SettlementStatus::Refunded])->save();
            $session->forceFill(['status' => GameStatus::Cancelled, 'cancelled_at' => now(), 'cancel_reason' => $reason, 'seed_revealed' => true])->save();
            GameTable::query()->whereKey($session->game_table_id)->update(['status' => TableStatus::Closed->value, 'closed_at' => now()]);

            AuditLogger::log($actor, 'game.cancel', $session, null, ['reason' => $reason]);
            event(new TableEvent($session->game_table_id, GameEvents::GAME_CANCELLED, ['session_id' => $session->id, 'reason' => $reason]));
        });
    }

    public function broadcastTimer(GameSession $session): void
    {
        if ($session->status !== GameStatus::Arranging || $session->arrangement_deadline === null) {
            return;
        }

        event(new TableEvent($session->game_table_id, GameEvents::TIMER_UPDATED, [
            'session_id' => $session->id,
            'arrangement_deadline' => $session->arrangement_deadline->toIso8601String(),
            'seconds_remaining' => max(0, (int) now()->diffInSeconds($session->arrangement_deadline, false)),
        ]));
    }

    private function storeSubmission(GameSession $session, int $userId, Arrangement $arrangement, bool $isFoul, bool $isAuto): GameSubmission
    {
        return GameSubmission::create([
            'game_session_id' => $session->id,
            'user_id' => $userId,
            'front' => $arrangement->front,
            'middle' => $arrangement->middle,
            'back' => $arrangement->back,
            'is_foul' => $isFoul,
            'is_auto' => $isAuto,
            'submitted_at' => now(),
        ]);
    }

    private function markAllSubmitted(GameSession $session): void
    {
        $session->forceFill(['status' => GameStatus::Submitted])->save();
        event(new TableEvent($session->game_table_id, GameEvents::ALL_SUBMITTED, ['session_id' => $session->id]));
        ResolveGameSession::dispatch($session->id)->afterCommit();
    }

    private function score(GameSession $session): void
    {
        if (GameResult::query()->where('game_session_id', $session->id)->exists()) {
            return;
        }

        $submissions = GameSubmission::query()->where('game_session_id', $session->id)->get()->keyBy('user_id');
        $seats = GameCard::query()->where('game_session_id', $session->id)->pluck('seat', 'user_id');
        $entries = WalletHold::query()->where('game_session_id', $session->id)->pluck('amount', 'user_id');

        $arrangements = $submissions->map(fn (GameSubmission $s) => new Arrangement($s->front, $s->middle, $s->back))->all();
        $forced = $submissions->map(fn (GameSubmission $s) => $s->is_foul)->all();

        $scoring = $session->config['scoring'] ?? [];
        $result = (new Scorer($scoring['win'] ?? 1, $scoring['loss'] ?? -1, $scoring['tie'] ?? 0))->score($arrangements, $forced);

        foreach ($result['comparisons'] as $row) {
            GameHandResult::create([
                'game_session_id' => $session->id,
                'user_id' => $row['player'],
                'opponent_id' => $row['opponent'],
                'position' => $row['position'],
                'outcome' => $row['outcome'],
            ]);
        }

        foreach ($result['totals'] as $userId => $total) {
            GameResult::create([
                'game_session_id' => $session->id,
                'user_id' => $userId,
                'seat' => $seats[$userId],
                'score' => $total,
                'is_foul' => $result['fouls'][$userId],
                'placement' => 1 + count(array_filter($result['totals'], fn (int $t) => $t > $total)),
                'entry_amount' => (int) ($entries[$userId] ?? 0),
                'hand_labels' => $arrangements[$userId]->labels(),
            ]);
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function revealedArrangements(GameSession $session): array
    {
        return GameSubmission::query()->with('user:id,name,username')->where('game_session_id', $session->id)->get()
            ->map(function (GameSubmission $s) {
                $arrangement = new Arrangement($s->front, $s->middle, $s->back);

                return [
                    'user_id' => $s->user_id,
                    'name' => $s->user->name,
                    'front' => $s->front,
                    'middle' => $s->middle,
                    'back' => $s->back,
                    'labels' => $arrangement->labels(),
                    'is_foul' => $s->is_foul,
                    'is_auto' => $s->is_auto,
                ];
            })->values()->all();
    }

    /**
     * Results shown to every player at the table. Contains game payouts but
     * never anyone's wallet balance.
     *
     * @return list<array<string, mixed>>
     */
    public function publicResults(GameSession $session): array
    {
        return GameResult::query()->with('user:id,name,username')->where('game_session_id', $session->id)->orderBy('placement')->orderBy('seat')->get()
            ->map(fn (GameResult $r) => [
                'user_id' => $r->user_id,
                'name' => $r->user->name,
                'seat' => $r->seat,
                'score' => $r->score,
                'placement' => $r->placement,
                'is_foul' => $r->is_foul,
                'hand_labels' => $r->hand_labels,
                'entry' => $r->entry_amount,
                'payout' => $r->payout_amount,
                'net' => $r->net_amount,
            ])->values()->all();
    }
}
