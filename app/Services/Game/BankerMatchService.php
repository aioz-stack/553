<?php

namespace App\Services\Game;

use App\Enums\Currency;
use App\Enums\GameMode;
use App\Enums\GameStatus;
use App\Enums\HoldStatus;
use App\Enums\RoomStatus;
use App\Enums\SettlementStatus;
use App\Enums\TableStatus;
use App\Enums\TransactionType;
use App\Events\Game\GameEvents;
use App\Events\Game\TableEvent;
use App\Events\Game\UserEvent;
use App\Exceptions\BusinessRuleException;
use App\Game\Arrangement;
use App\Game\Banker\BankerRound;
use App\Game\Deck;
use App\Game\LuckyHand;
use App\Jobs\CloseBetting;
use App\Jobs\ExpireArrangement;
use App\Jobs\StartNextRound;
use App\Models\GameBet;
use App\Models\GameCard;
use App\Models\GameHandResult;
use App\Models\GamePayout;
use App\Models\GamePlayer;
use App\Models\GameResult;
use App\Models\GameSession;
use App\Models\GameSettlement;
use App\Models\GameSubmission;
use App\Models\GameTable;
use App\Models\PlatformFee;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletHold;
use App\Notifications\GameStarted;
use App\Services\Agent\CommissionService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * 12-round banker matches: Round Bank (rotating banker) and Banker Mode
 * (fixed banker with the highest-balance replacement rule).
 *
 * A match is one game_table; each round is one game_session:
 *
 *   BETTING → ARRANGING → SUBMITTED → REVEALING → SCORING → COMPLETED
 *      (deal happens when betting closes; reveal/score/complete are run by
 *       GameEngine::resolve, which calls score()/settle()/afterRound() here)
 *
 * Money: for every bet both the player and the banker move 2 × bet from
 * their wallet into escrow (a wallet hold each), so the worst case is always
 * covered and nobody can bet with money they do not have. Settlement pays
 * every hold back out of escrow per the BankerRound maths with deterministic
 * idempotency keys, so retries never pay twice.
 *
 * Every state change locks the session or table row and re-checks state, so
 * jobs, the sweep and duplicate requests are safe.
 */
class BankerMatchService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
        private readonly CommissionService $commissions,
    ) {}

    // ------------------------------------------------------------------
    // Match start / round start
    // ------------------------------------------------------------------

    /**
     * Start the match once enough players are seated and every one is ready.
     */
    public function maybeStart(GameTable $table): ?GameSession
    {
        return DB::transaction(function () use ($table) {
            $table = GameTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();

            if (! $table->hasBanker() || ! in_array($table->status, [TableStatus::WaitingForPlayers, TableStatus::Ready], true)) {
                return null;
            }

            $players = GamePlayer::query()->where('game_table_id', $table->id)->get();

            if ($players->count() < $this->minPlayers($table) || ! $players->every('is_ready')) {
                return null;
            }

            $table->forceFill(['status' => TableStatus::InGame, 'full_at' => now(), 'rounds_played' => 0])->save();
            event(new TableEvent($table->id, GameEvents::MATCH_STARTED, [
                'game_mode' => $table->game_mode->value,
                'rounds_total' => $table->rounds_total,
            ]));

            return $this->startRound($table);
        });
    }

    /**
     * Begin the next round: drop long-offline players, assign the banker,
     * open betting. Ends the match when fewer than two eligible players remain.
     */
    public function startRound(GameTable $table): ?GameSession
    {
        return DB::transaction(function () use ($table) {
            $table = GameTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();

            if (! $table->hasBanker() || $table->status !== TableStatus::InGame) {
                return null;
            }

            if ($table->current_session_id && ! GameSession::query()->whereKey($table->current_session_id)->first()?->status->isFinal()) {
                return null; // a round is running
            }

            if ($table->rounds_played >= $table->rounds_total) {
                $this->end($table, 'completed');

                return null;
            }

            $room = $table->room;
            $config = $room->snapshot();
            $currency = $room->currency;
            $minReserve = $config['min_bet'] * (int) $config['banker']['reserve_multiplier'];

            $players = GamePlayer::query()->with('user')->where('game_table_id', $table->id)->orderBy('seat')->lockForUpdate()->get();

            foreach ($players as $player) {
                if ($player->is_connected) {
                    continue;
                }

                $player->forceFill(['missed_rounds' => $player->missed_rounds + 1])->save();

                if ($player->missed_rounds >= (int) config('pusoy.banker.max_missed_rounds', 2)) {
                    $player->delete();
                    event(new TableEvent($table->id, GameEvents::PLAYER_LEFT, ['user_id' => $player->user_id, 'reason' => 'inactive']));
                }
            }

            $players = $players->filter(fn (GamePlayer $p) => $p->exists)->values();
            $balances = $players->mapWithKeys(fn (GamePlayer $p) => [$p->user_id => $this->wallets->for($p->user, $currency)->balance])->all();
            $eligible = $players->filter(fn (GamePlayer $p) => $p->is_connected && $balances[$p->user_id] >= $minReserve)->values();

            if ($eligible->count() < 2) {
                $this->end($table, $players->count() < 2 ? 'not_enough_players' : 'not_enough_eligible_players');

                return null;
            }

            $previousBanker = $table->banker_user_id;
            [$banker, $reason] = $this->chooseBanker($table, $eligible, $balances);
            $participants = $eligible->where('user_id', '!=', $banker->user_id)->pluck('user_id')->values()->all();

            GamePlayer::query()->whereIn('id', $eligible->pluck('id'))->update(['missed_rounds' => 0]);

            $seed = Deck::newSeed();
            $deadline = now()->addSeconds(max(5, (int) $config['betting_seconds']));
            $round = $table->rounds_played + 1;

            $session = GameSession::create([
                'game_table_id' => $table->id,
                'game_room_id' => $room->id,
                'round_number' => $round,
                'banker_user_id' => $banker->user_id,
                'status' => GameStatus::Betting,
                'config' => $config + [
                    'round_number' => $round,
                    'rounds_total' => $table->rounds_total,
                    'banker_user_id' => $banker->user_id,
                    'participants' => $participants,
                ],
                'currency' => $currency,
                'pot' => 0,
                'deck_commitment' => Deck::commitment($seed, Deck::shuffled($seed)),
                'server_seed' => $seed,
                'betting_deadline' => $deadline,
            ]);

            $table->forceFill([
                'current_session_id' => $session->id,
                'banker_user_id' => $banker->user_id,
                'next_round_at' => null,
            ])->save();

            event(new TableEvent($table->id, GameEvents::BANKER_ASSIGNED, [
                'session_id' => $session->id,
                'round_number' => $round,
                'banker_user_id' => $banker->user_id,
                'previous_banker_user_id' => $previousBanker,
                'reason' => $reason,
            ]));

            event(new TableEvent($table->id, GameEvents::ROUND_STARTED, [
                'session_id' => $session->id,
                'round_number' => $round,
                'rounds_total' => $table->rounds_total,
                'banker_user_id' => $banker->user_id,
                'participants' => $participants,
                'min_bet' => Points::decimal($config['min_bet']),
                'max_bet' => Points::decimal($config['max_bet']),
                'betting_deadline' => $deadline->toIso8601String(),
                'deck_commitment' => $session->deck_commitment,
            ]));

            CloseBetting::dispatch($session->id)->delay($deadline)->afterCommit();

            return $session;
        });
    }

    /**
     * Banker Mode: the creator banks; if they are gone or ineligible, the
     * eligible player with the highest available balance takes over (ties:
     * lowest seat). Round Bank: the seat after the previous banker, never the
     * same player twice in a row while someone else is eligible.
     *
     * @param  Collection<int, GamePlayer>  $eligible
     * @param  array<int, int>  $balances
     * @return array{0: GamePlayer, 1: string}
     */
    public function chooseBanker(GameTable $table, Collection $eligible, array $balances): array
    {
        $bySeat = $eligible->sortBy('seat')->values();

        if ($table->game_mode === GameMode::Banker) {
            if ($table->banker_user_id && ($current = $bySeat->firstWhere('user_id', $table->banker_user_id))) {
                return [$current, 'continues'];
            }

            if ($table->rounds_played === 0 && $table->banker_user_id === null && ($creator = $bySeat->firstWhere('user_id', $table->creator_user_id))) {
                return [$creator, 'room_creator'];
            }

            $richest = $bySeat->sort(fn (GamePlayer $a, GamePlayer $b) => [$balances[$b->user_id], $a->seat] <=> [$balances[$a->user_id], $b->seat])->first();

            return [$richest, $table->banker_user_id ? 'replacement_highest_balance' : 'highest_balance'];
        }

        if ($table->banker_user_id === null) {
            return [$bySeat->first(), 'first_eligible'];
        }

        $lastSeat = GameCard::query()->where('game_session_id', $table->current_session_id)->where('user_id', $table->banker_user_id)->value('seat')
            ?? GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $table->banker_user_id)->value('seat')
            ?? 0;

        $others = $bySeat->where('user_id', '!=', $table->banker_user_id)->values();
        $next = $others->first(fn (GamePlayer $p) => $p->seat > $lastSeat) ?? $others->first() ?? $bySeat->first();

        return [$next, 'rotation'];
    }

    // ------------------------------------------------------------------
    // Betting
    // ------------------------------------------------------------------

    public function placeBet(User $user, GameSession $session, int $amount, bool $auto = false): GameBet
    {
        return DB::transaction(function () use ($user, $session, $amount, $auto) {
            $session = GameSession::query()->whereKey($session->id)->lockForUpdate()->firstOrFail();
            $config = $session->config;

            if (! $session->isBankerRound()) {
                throw new BusinessRuleException('This game has no betting phase.', 409, 'invalid_state');
            }

            if ($session->status !== GameStatus::Betting || (! $auto && $session->betting_deadline?->isPast())) {
                throw new BusinessRuleException('Betting is closed for this round.', 409, 'betting_closed');
            }

            if ($user->id === $session->banker_user_id) {
                throw new BusinessRuleException('The banker covers bets and does not place one.', 409, 'banker_cannot_bet');
            }

            if (! in_array($user->id, $config['participants'] ?? [], true) || ! $this->isSeated($session->game_table_id, $user->id)) {
                throw new BusinessRuleException('You are not playing this round. You will be dealt in next round.', 403, 'not_participant');
            }

            if (GameBet::query()->where('game_session_id', $session->id)->where('user_id', $user->id)->exists()) {
                throw new BusinessRuleException('You have already placed your bet for this round.', 409, 'already_bet');
            }

            if ($amount < $config['min_bet'] || $amount > $config['max_bet']) {
                throw new BusinessRuleException('Bet must be between '.Points::decimal($config['min_bet']).' and '.Points::decimal($config['max_bet']).'.', 422, 'invalid_bet');
            }

            $currency = $session->currency;
            $reserve = $amount * (int) $config['banker']['reserve_multiplier'];
            $banker = User::query()->findOrFail($session->banker_user_id);
            $playerWallet = $this->wallets->for($user, $currency);
            $bankerWallet = $this->wallets->for($banker, $currency);

            // Lock both wallets (id order) before checking cover, so concurrent bets
            // against the same banker can never over-commit the banker's balance.
            $locked = Wallet::query()->whereIn('id', [$playerWallet->id, $bankerWallet->id])->orderBy('id')->lockForUpdate()->get()->keyBy('id');

            if ($locked[$playerWallet->id]->balance < $reserve) {
                throw new BusinessRuleException('You need '.Points::decimal($reserve).' '.$currency->value.' available to cover a '.Points::decimal($amount).' bet (2× reserve).', 422, 'insufficient_balance');
            }

            if ($locked[$bankerWallet->id]->balance < $reserve) {
                throw new BusinessRuleException('The banker cannot cover a bet this size. Try a smaller bet.', 422, 'banker_cannot_cover');
            }

            $escrow = $this->wallets->escrow($currency);
            $meta = ['table_id' => $session->game_table_id, 'round' => $session->round_number, 'bet' => $amount];

            $playerTx = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::GameEntry,
                currency: $currency,
                source: $locked[$playerWallet->id],
                destination: $escrow,
                amount: $reserve,
                reason: "Bet {$this->fmt($amount, $currency)} round {$session->round_number} (2× reserve)",
                actor: $user,
                idempotencyKey: "bet:{$session->id}:{$user->id}",
                relatedPlayerId: $user->id,
                gameSessionId: $session->id,
                metadata: $meta + ['role' => 'player'],
            ));

            $bankerTx = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::GameEntry,
                currency: $currency,
                source: $locked[$bankerWallet->id],
                destination: $escrow,
                amount: $reserve,
                reason: "Banker cover for {$user->username} round {$session->round_number}",
                idempotencyKey: "cover:{$session->id}:{$user->id}",
                relatedPlayerId: $banker->id,
                gameSessionId: $session->id,
                metadata: $meta + ['role' => 'banker', 'covers_user_id' => $user->id],
            ));

            $hold = fn (Wallet $wallet, int $ownerId, int $txId) => WalletHold::create([
                'wallet_id' => $wallet->id,
                'user_id' => $ownerId,
                'game_table_id' => $session->game_table_id,
                'game_session_id' => $session->id,
                'currency' => $currency,
                'amount' => $reserve,
                'status' => HoldStatus::Held,
                'entry_transaction_id' => $txId,
            ]);

            $bet = GameBet::create([
                'game_session_id' => $session->id,
                'user_id' => $user->id,
                'banker_user_id' => $banker->id,
                'currency' => $currency,
                'amount' => $amount,
                'reserve' => $reserve,
                'player_hold_id' => $hold($playerWallet, $user->id, $playerTx->id)->id,
                'banker_hold_id' => $hold($bankerWallet, $banker->id, $bankerTx->id)->id,
                'is_auto' => $auto,
            ]);

            $session->forceFill(['pot' => $session->pot + 2 * $reserve])->save();

            event(new TableEvent($session->game_table_id, GameEvents::PLAYER_BET, [
                'session_id' => $session->id,
                'user_id' => $user->id,
                'amount' => Points::decimal($amount),
                'is_auto' => $auto,
            ]));
            $this->walletUpdated([$user->id, $banker->id], $currency);

            if (! $auto && $this->allBet($session)) {
                $this->deal($session);
            }

            return $bet;
        });
    }

    /**
     * Betting deadline (or everyone has bet): connected players who did not bet
     * get the minimum bet when affordable; the others sit this round out.
     */
    public function closeBetting(GameSession $session, bool $force = false): void
    {
        DB::transaction(function () use ($session, $force) {
            $session = GameSession::query()->whereKey($session->id)->lockForUpdate()->firstOrFail();

            if ($session->status !== GameStatus::Betting) {
                return;
            }

            if (! $force && $session->betting_deadline?->isFuture() && ! $this->allBet($session)) {
                return;
            }

            $bet = GameBet::query()->where('game_session_id', $session->id)->pluck('user_id')->all();
            $connected = GamePlayer::query()->where('game_table_id', $session->game_table_id)->where('is_connected', true)->pluck('user_id')->all();

            foreach (array_diff($session->config['participants'] ?? [], $bet) as $userId) {
                if (! in_array($userId, $connected, true)) {
                    continue;
                }

                try {
                    $this->placeBet(User::query()->findOrFail($userId), $session, (int) $session->config['min_bet'], auto: true);
                } catch (BusinessRuleException) {
                    // cannot afford / banker cannot cover: sits this round out
                }
            }

            $session->refresh();

            if (! GameBet::query()->where('game_session_id', $session->id)->exists()) {
                $session->forceFill(['status' => GameStatus::Cancelled, 'cancelled_at' => now(), 'cancel_reason' => 'no_bets', 'seed_revealed' => true])->save();
                event(new TableEvent($session->game_table_id, GameEvents::GAME_CANCELLED, ['session_id' => $session->id, 'reason' => 'no_bets']));
                $this->end(GameTable::query()->whereKey($session->game_table_id)->lockForUpdate()->firstOrFail(), 'no_bets');

                return;
            }

            $this->deal($session);
        });
    }

    /**
     * Deal 13 cards to the banker and every player with a bet. The deck was
     * committed when the round opened; the seed is revealed after the round.
     */
    private function deal(GameSession $session): void
    {
        if ($session->status !== GameStatus::Betting) {
            return;
        }

        $bettors = GameBet::query()->where('game_session_id', $session->id)->pluck('user_id')->all();
        $seats = GamePlayer::query()->where('game_table_id', $session->game_table_id)
            ->whereIn('user_id', [...$bettors, $session->banker_user_id])->orderBy('seat')->pluck('seat', 'user_id');

        $deck = Deck::shuffled($session->server_seed);
        $hands = Deck::deal($deck);
        $i = 1;
        $dealt = [];

        foreach ($seats as $userId => $seat) {
            GameCard::create(['game_session_id' => $session->id, 'user_id' => $userId, 'seat' => $seat, 'cards' => $hands[$i]]);
            $dealt[$userId] = $hands[$i++];
        }

        $deadline = now()->addSeconds((int) $session->config['arrangement_seconds']);
        $session->forceFill(['status' => GameStatus::Arranging, 'started_at' => now(), 'arrangement_deadline' => $deadline])->save();

        event(new TableEvent($session->game_table_id, GameEvents::BETTING_CLOSED, [
            'session_id' => $session->id,
            'bets' => $this->publicBets($session),
        ]));

        event(new TableEvent($session->game_table_id, GameEvents::GAME_STARTED, [
            'session_id' => $session->id,
            'round_number' => $session->round_number,
            'banker_user_id' => $session->banker_user_id,
            'deck_commitment' => $session->deck_commitment,
            'arrangement_deadline' => $deadline->toIso8601String(),
        ]));

        $luckyEnabled = (bool) ($session->config['lucky_hands_enabled'] ?? true);

        foreach ($dealt as $userId => $cards) {
            event(new UserEvent($userId, GameEvents::CARDS_DEALT, [
                'session_id' => $session->id,
                'table_id' => $session->game_table_id,
                'cards' => $cards,
                'lucky' => $luckyEnabled ? (LuckyHand::detect($cards)['type'] ?? null) : null,
            ]));
        }

        event(new TableEvent($session->game_table_id, GameEvents::TIMER_UPDATED, [
            'session_id' => $session->id,
            'arrangement_deadline' => $deadline->toIso8601String(),
            'seconds_remaining' => (int) $session->config['arrangement_seconds'],
        ]));

        if ($session->round_number === 1) {
            Notification::send(User::query()->whereIn('id', array_keys($dealt))->get(), (new GameStarted($session))->afterCommit());
        }

        ExpireArrangement::dispatch($session->id)->delay($deadline)->afterCommit();
    }

    // ------------------------------------------------------------------
    // Lucky Hand
    // ------------------------------------------------------------------

    /**
     * Declare LUCKY. The server re-checks the dealt cards; a valid declaration
     * locks the hand (it counts as the player's submission) before any reveal.
     */
    public function declareLucky(User $user, GameSession $session, GameEngine $engine): GameSubmission
    {
        return DB::transaction(function () use ($user, $session, $engine) {
            $session = GameSession::query()->whereKey($session->id)->lockForUpdate()->firstOrFail();

            if (! $session->isBankerRound() || ! ($session->config['lucky_hands_enabled'] ?? true)) {
                throw new BusinessRuleException('Lucky Hands are not enabled in this room.', 409, 'lucky_disabled');
            }

            if ($session->status !== GameStatus::Arranging || $session->arrangement_deadline?->isPast()) {
                throw new BusinessRuleException('Lucky Hands must be declared before the reveal.', 409, 'invalid_state');
            }

            $card = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $user->id)->first()
                ?? throw new BusinessRuleException('You are not playing this round.', 403, 'forbidden');

            if (GameSubmission::query()->where('game_session_id', $session->id)->where('user_id', $user->id)->exists()) {
                throw new BusinessRuleException('Your hand is already locked in.', 409, 'already_submitted');
            }

            $lucky = LuckyHand::detect($card->cards)
                ?? throw new BusinessRuleException('Your cards do not form a Lucky Hand.', 422, 'not_lucky');

            $arrangement = $lucky['arrangement'];
            $submission = GameSubmission::create([
                'game_session_id' => $session->id,
                'user_id' => $user->id,
                'front' => $arrangement->front,
                'middle' => $arrangement->middle,
                'back' => $arrangement->back,
                'is_foul' => false,
                'is_auto' => false,
                'lucky_type' => $lucky['type'],
                'submitted_at' => now(),
            ]);

            $count = GameSubmission::query()->where('game_session_id', $session->id)->count();
            event(new TableEvent($session->game_table_id, GameEvents::PLAYER_LUCKY, ['session_id' => $session->id, 'user_id' => $user->id]));
            event(new TableEvent($session->game_table_id, GameEvents::PLAYER_SUBMITTED, ['session_id' => $session->id, 'user_id' => $user->id, 'submitted_count' => $count]));

            if ($count === GameCard::query()->where('game_session_id', $session->id)->count()) {
                $engine->markAllSubmitted($session);
            }

            return $submission;
        });
    }

    // ------------------------------------------------------------------
    // Scoring, settlement, next round
    // ------------------------------------------------------------------

    /**
     * Compare every player's lanes with the banker's and store the results
     * (amounts included; they are only shown once the round completes).
     */
    public function score(GameSession $session): void
    {
        if (GameResult::query()->where('game_session_id', $session->id)->exists()) {
            return;
        }

        $config = $session->config;
        $bankerId = (int) $session->banker_user_id;
        $submissions = GameSubmission::query()->where('game_session_id', $session->id)->get()->keyBy('user_id');
        $seats = GameCard::query()->where('game_session_id', $session->id)->pluck('seat', 'user_id');
        $bets = GameBet::query()->where('game_session_id', $session->id)->pluck('amount', 'user_id')->map(fn ($a) => (int) $a)->all();

        $arrangements = $submissions->map(fn (GameSubmission $s) => new Arrangement($s->front, $s->middle, $s->back))->all();
        $calc = (new BankerRound(
            table: $config['banker']['settlement'],
            luckyMultiplier: (int) $config['banker']['lucky_multiplier'],
            reserveMultiplier: (int) $config['banker']['reserve_multiplier'],
            feeBps: (int) $config['platform_fee_bps'],
        ))->settle(
            $bankerId,
            $bets,
            $arrangements,
            $submissions->map(fn (GameSubmission $s) => $s->is_foul)->all(),
            $submissions->map(fn (GameSubmission $s) => $s->lucky_type)->all(),
        );

        foreach ($calc['players'] as $userId => $row) {
            foreach ($row['lanes'] ?? [] as $position => $outcome) {
                GameHandResult::create(['game_session_id' => $session->id, 'user_id' => $userId, 'opponent_id' => $bankerId, 'position' => $position, 'outcome' => $outcome]);
                GameHandResult::create(['game_session_id' => $session->id, 'user_id' => $bankerId, 'opponent_id' => $userId, 'position' => $position, 'outcome' => -$outcome]);
            }
        }

        $rows = $calc['players'];
        $rows[$bankerId] = $calc['banker'] + [
            'bet' => array_sum($bets),
            'lanes' => null,
            'multiple' => -array_sum(array_column($calc['players'], 'multiple')),
        ];

        $nets = array_map(fn (array $r) => $r['net'], $rows);

        foreach ($rows as $userId => $row) {
            GameResult::create([
                'game_session_id' => $session->id,
                'user_id' => $userId,
                'seat' => $seats[$userId],
                'role' => $userId === $bankerId ? 'banker' : 'player',
                'round_number' => $session->round_number,
                'score' => $row['multiple'],
                'is_foul' => $row['is_foul'],
                'placement' => 1 + count(array_filter($nets, fn (int $n) => $n > $row['net'])),
                'entry_amount' => $row['reserve'],
                'bet_amount' => $row['bet'],
                'payout_amount' => $row['payout'],
                'net_amount' => $row['net'],
                'hand_labels' => $arrangements[$userId]->labels(),
                'lane_results' => $row['lanes'],
                'lucky_type' => $row['lucky_type'],
                'lucky_bonus' => $row['lucky_bonus'],
                'platform_fee' => $row['fee'],
            ]);
        }
    }

    public function settle(GameSession $session): GameSettlement
    {
        $settlement = GameSettlement::query()->firstOrCreate(
            ['game_session_id' => $session->id],
            ['status' => SettlementStatus::Pending, 'currency' => $session->currency, 'pot' => $session->pot],
        );

        if ($settlement->status === SettlementStatus::Settled) {
            return $settlement;
        }

        try {
            return DB::transaction(fn () => $this->applySettlement($session, $settlement));
        } catch (Throwable $e) {
            $settlement->forceFill([
                'status' => SettlementStatus::Failed,
                'attempts' => $settlement->attempts + 1,
                'last_error' => substr($e->getMessage(), 0, 2000),
            ])->save();

            throw $e;
        }
    }

    private function applySettlement(GameSession $session, GameSettlement $settlement): GameSettlement
    {
        $settlement = GameSettlement::query()->whereKey($settlement->id)->lockForUpdate()->firstOrFail();

        if ($settlement->status === SettlementStatus::Settled) {
            return $settlement;
        }

        $currency = $session->currency;
        $results = GameResult::query()->with('user')->where('game_session_id', $session->id)->get();
        $holds = WalletHold::query()->where('game_session_id', $session->id)->where('status', HoldStatus::Held->value)->lockForUpdate()->get();
        $escrow = $this->wallets->escrow($currency);

        $fees = (int) $results->sum('platform_fee');
        $payouts = (int) $results->sum('payout_amount');

        if ($payouts + $fees !== (int) $holds->sum('amount')) {
            throw new BusinessRuleException("Settlement mismatch for round #{$session->id}: payouts {$payouts} + fees {$fees} ≠ reserved {$holds->sum('amount')}.", 500, 'settlement_mismatch');
        }

        foreach ($results as $result) {
            $transactionId = null;

            if ($result->payout_amount > 0) {
                $lucky = $result->lucky_bonus > 0;
                $transactionId = $this->ledger->transfer(new TransferRequest(
                    type: $lucky ? TransactionType::LuckyBonus : TransactionType::GameReward,
                    currency: $currency,
                    source: $escrow,
                    destination: $this->wallets->for($result->user, $currency),
                    amount: $result->payout_amount,
                    reason: $lucky
                        ? 'Lucky Hand ('.(LuckyHand::LABELS[$result->lucky_type] ?? $result->lucky_type).") round {$session->round_number}: reserve back + bonus"
                        : ($result->role === 'banker' ? 'Banker' : 'Player')." settlement round {$session->round_number}",
                    idempotencyKey: "payout:{$session->id}:{$result->user_id}",
                    relatedPlayerId: $result->user_id,
                    gameSessionId: $session->id,
                    metadata: [
                        'role' => $result->role,
                        'round' => $session->round_number,
                        'net' => $result->net_amount,
                        'lanes' => $result->lane_results,
                        'lucky_type' => $result->lucky_type,
                    ],
                ))->id;
            }

            GamePayout::query()->updateOrCreate(
                ['game_settlement_id' => $settlement->id, 'user_id' => $result->user_id],
                ['amount' => $result->payout_amount, 'wallet_transaction_id' => $transactionId],
            );
        }

        if ($fees > 0) {
            $feeTx = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::PlatformFee,
                currency: $currency,
                source: $escrow,
                destination: $this->wallets->platform($currency),
                amount: $fees,
                reason: "Platform fee round #{$session->id}",
                idempotencyKey: "fee:{$session->id}",
                gameSessionId: $session->id,
            ));

            PlatformFee::query()->updateOrCreate(
                ['game_session_id' => $session->id],
                ['currency' => $currency, 'amount' => $fees, 'wallet_transaction_id' => $feeTx->id],
            );
        }

        WalletHold::query()->whereIn('id', $holds->pluck('id'))->update(['status' => HoldStatus::Captured->value]);
        $session->forceFill(['platform_fee' => $fees])->save();

        $attribution = $results->filter(fn (GameResult $r) => $r->platform_fee > 0)->mapWithKeys(fn (GameResult $r) => [$r->user_id => $r->platform_fee])->all();

        $settlement->forceFill([
            'status' => SettlementStatus::Settled,
            'platform_fee' => $fees,
            'payout_total' => $payouts,
            'breakdown' => [
                'mode' => $session->config['game_mode'],
                'round' => $session->round_number,
                'banker_user_id' => $session->banker_user_id,
                'payouts' => $results->pluck('payout_amount', 'user_id'),
                'net' => $results->pluck('net_amount', 'user_id'),
                'fee_attribution' => $attribution,
            ],
            'attempts' => $settlement->attempts + 1,
            'last_error' => null,
            'settled_at' => now(),
        ])->save();

        $this->commissions->generateForSession($session, $attribution);

        return $settlement;
    }

    /**
     * Called by GameEngine inside the transaction that completes a round.
     */
    public function afterRound(GameSession $session): void
    {
        $table = GameTable::query()->whereKey($session->game_table_id)->lockForUpdate()->firstOrFail();
        $results = GameResult::query()->where('game_session_id', $session->id)->get();
        $xp = config('pusoy.xp');

        foreach ($results as $result) {
            $won = $result->net_amount > 0;
            $profile = PlayerProfile::query()->firstOrCreate(['user_id' => $result->user_id]);
            $profile->increment('games_played', 1, [
                'games_won' => $profile->games_won + ($won ? 1 : 0),
                'total_score' => $profile->total_score + $result->score,
                'xp' => $profile->xp + $xp['per_round'] + ($won ? $xp['per_win'] : 0),
            ]);
        }

        GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $session->banker_user_id)->increment('banker_rounds');

        $table->forceFill(['rounds_played' => max($table->rounds_played, $session->round_number)])->save();
        $this->walletUpdated($results->pluck('user_id')->all(), $session->currency);

        if ($table->rounds_played >= $table->rounds_total) {
            event(new TableEvent($table->id, GameEvents::ROUND_COMPLETED, $this->roundPayload($table, $session, null)));
            $this->end($table, 'completed');

            return;
        }

        $next = now()->addSeconds((int) config('pusoy.banker.intermission_seconds', 8));
        $table->forceFill(['next_round_at' => $next])->save();

        event(new TableEvent($table->id, GameEvents::ROUND_COMPLETED, $this->roundPayload($table, $session, $next->toIso8601String())));

        StartNextRound::dispatch($table->id)->delay($next)->afterCommit();
    }

    /**
     * Close the match. Player-hosted rooms are retired with their table.
     */
    public function end(GameTable $table, string $reason): void
    {
        if ($table->status === TableStatus::Closed) {
            return;
        }

        $table->forceFill(['status' => TableStatus::Closed, 'closed_at' => now(), 'end_reason' => $reason, 'next_round_at' => null])->save();

        $room = $table->room;

        if ($room->owner_id !== null && $room->game_mode->hasBanker()) {
            $room->forceFill(['status' => RoomStatus::Inactive])->save();
        }

        event(new TableEvent($table->id, GameEvents::MATCH_COMPLETED, [
            'reason' => $reason,
            'rounds_played' => $table->rounds_played,
            'rounds_total' => $table->rounds_total,
            'standings' => $this->standings($table),
        ]));
    }

    // ------------------------------------------------------------------
    // Seating hooks (TableService)
    // ------------------------------------------------------------------

    /**
     * Leave rules: free to leave before the match and between rounds; while a
     * round you are in (bet placed, dealt in, or banking) is running you must
     * finish it so the round can be settled first.
     */
    public function assertCanLeave(GameTable $table, User $user): void
    {
        if ($table->status !== TableStatus::InGame || ! $table->current_session_id) {
            return;
        }

        $session = GameSession::query()->find($table->current_session_id);

        if ($session === null || $session->status->isFinal()) {
            return;
        }

        $involved = $session->banker_user_id === $user->id
            || GameBet::query()->where('game_session_id', $session->id)->where('user_id', $user->id)->exists()
            || GameCard::query()->where('game_session_id', $session->id)->where('user_id', $user->id)->exists();

        if ($involved) {
            throw new BusinessRuleException('Finish this round first — you can leave between rounds.', 409, 'round_in_progress');
        }
    }

    public function afterLeave(GameTable $table): void
    {
        $remaining = GamePlayer::query()->where('game_table_id', $table->id)->orderBy('seat')->get();

        if (in_array($table->status, [TableStatus::WaitingForPlayers, TableStatus::Ready], true)) {
            if ($remaining->isEmpty()) {
                $this->end($table, 'abandoned');
            } elseif (! $remaining->contains('user_id', $table->creator_user_id)) {
                $table->forceFill(['creator_user_id' => $remaining->first()->user_id])->save();
            }

            return;
        }

        if ($table->status === TableStatus::InGame && $remaining->count() < 2) {
            $session = $table->current_session_id ? GameSession::query()->find($table->current_session_id) : null;

            if ($session === null || $session->status->isFinal()) {
                $this->end($table, 'not_enough_players');
            }
        }
    }

    public function minPlayers(GameTable $table): int
    {
        return max((int) config('pusoy.banker.min_players', 2), min(4, (int) ($table->room->min_players ?? 2)));
    }

    // ------------------------------------------------------------------
    // Presentation helpers
    // ------------------------------------------------------------------

    /**
     * Running totals for the match. Bets and results only — never balances.
     *
     * @return list<array<string, mixed>>
     */
    public function standings(GameTable $table): array
    {
        $rows = GameResult::query()
            ->join('game_sessions', 'game_sessions.id', '=', 'game_results.game_session_id')
            ->join('users', 'users.id', '=', 'game_results.user_id')
            ->leftJoin('player_profiles', 'player_profiles.user_id', '=', 'users.id')
            ->where('game_sessions.game_table_id', $table->id)
            ->where('game_sessions.status', GameStatus::Completed->value)
            ->groupBy('game_results.user_id', 'users.name', 'player_profiles.display_name')
            ->selectRaw('game_results.user_id, users.name, player_profiles.display_name, COUNT(*) as rounds, SUM(game_results.net_amount) as net,
                SUM(CASE WHEN game_results.net_amount > 0 THEN 1 ELSE 0 END) as won,
                SUM(CASE WHEN game_results.net_amount < 0 THEN 1 ELSE 0 END) as lost,
                SUM(CASE WHEN game_results.role = \'banker\' THEN 1 ELSE 0 END) as banker_rounds,
                SUM(CASE WHEN game_results.lucky_type IS NOT NULL THEN 1 ELSE 0 END) as lucky')
            ->orderByDesc('net')
            ->get();

        return $rows->values()->map(fn ($r, int $i) => [
            'rank' => $i + 1,
            'user_id' => (int) $r->user_id,
            'name' => $r->display_name ?? $r->name,
            'rounds' => (int) $r->rounds,
            'won' => (int) $r->won,
            'lost' => (int) $r->lost,
            'tied' => (int) $r->rounds - (int) $r->won - (int) $r->lost,
            'banker_rounds' => (int) $r->banker_rounds,
            'lucky' => (int) $r->lucky,
            'net' => Points::decimal((int) $r->net),
        ])->all();
    }

    /**
     * @return list<array{user_id: int, amount: string, is_auto: bool}>
     */
    public function publicBets(GameSession $session): array
    {
        return GameBet::query()->where('game_session_id', $session->id)->orderBy('id')->get()
            ->map(fn (GameBet $b) => ['user_id' => $b->user_id, 'amount' => Points::decimal($b->amount), 'is_auto' => $b->is_auto])
            ->all();
    }

    /**
     * Remaining rounds the user is expected to bank in this match.
     */
    public function remainingBankerRounds(GameTable $table, int $userId): int
    {
        if (! $table->hasBanker() || $table->status === TableStatus::Closed) {
            return 0;
        }

        $remaining = $table->rounds_total - $table->rounds_played;

        if ($table->game_mode === GameMode::Banker) {
            return $table->banker_user_id === $userId ? $remaining : 0;
        }

        $seats = GamePlayer::query()->where('game_table_id', $table->id)->orderBy('seat')->pluck('user_id')->values()->all();
        $count = count($seats);

        if ($count < 2 || ! in_array($userId, $seats, true)) {
            return 0;
        }

        // Rotation from the current banker; the current (unfinished) round counts.
        $position = array_search($table->banker_user_id, $seats, true);
        $position = $position === false ? -1 : $position;
        $inProgress = $table->current_session_id && ! GameSession::query()->find($table->current_session_id)?->status->isFinal();
        $start = $inProgress ? $position : $position + 1;
        $mine = 0;

        for ($r = 0; $r < $remaining; $r++) {
            if ($seats[(($start + $r) % $count + $count) % $count] === $userId) {
                $mine++;
            }
        }

        return $mine;
    }

    private function allBet(GameSession $session): bool
    {
        $seated = GamePlayer::query()->where('game_table_id', $session->game_table_id)->pluck('user_id')->all();
        $waiting = array_intersect($session->config['participants'] ?? [], $seated);
        $bet = GameBet::query()->where('game_session_id', $session->id)->pluck('user_id')->all();

        return $waiting !== [] && array_diff($waiting, $bet) === [];
    }

    private function isSeated(int $tableId, int $userId): bool
    {
        return GamePlayer::query()->where('game_table_id', $tableId)->where('user_id', $userId)->exists();
    }

    /**
     * Push each user's own new balance to their private channel only.
     *
     * @param  list<int>  $userIds
     */
    private function walletUpdated(array $userIds, Currency $currency): void
    {
        foreach (array_unique($userIds) as $userId) {
            $balance = Wallet::query()->where('user_id', $userId)
                ->where('currency', $currency->value)->where('type', 'player')->value('balance');

            event(new UserEvent($userId, GameEvents::WALLET_UPDATED, [
                'currency' => $currency->value,
                'balance' => Points::decimal((int) $balance),
            ]));
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function roundPayload(GameTable $table, GameSession $session, ?string $nextRoundAt): array
    {
        return [
            'session_id' => $session->id,
            'round_number' => $session->round_number,
            'rounds_total' => $table->rounds_total,
            'rounds_played' => $table->rounds_played,
            'next_round_at' => $nextRoundAt,
            'standings' => $this->standings($table),
        ];
    }

    private function fmt(int $amount, Currency $currency): string
    {
        return Points::decimal($amount).' '.$currency->value;
    }
}
