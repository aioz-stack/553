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
use App\Services\Game\LobbyEntryService;
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
use App\Support\Avatars;
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
     * Start the match once at least minPlayers() are seated and everyone seated is ready. Lobby tables (`owner_starts`) never start on
     * their own: the lobby owner presses Start (LobbyService::start → $byOwner = true).
     */
    public function maybeStart(GameTable $table, bool $byOwner = false): ?GameSession
    {
        return DB::transaction(function () use ($table, $byOwner) {
            $table = GameTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();

            if (! $table->hasBanker() || ! in_array($table->status, [TableStatus::WaitingForPlayers, TableStatus::Ready], true)) {
                return null;
            }

            if ($table->room->owner_starts && ! $byOwner) {
                return null;
            }

            $players = GamePlayer::query()->where('game_table_id', $table->id)->get();

            if ($players->count() < $this->minPlayers($table) || ! $players->every('is_ready')) {
                return null;
            }

            $table->forceFill(['status' => TableStatus::InGame, 'full_at' => now(), 'rounds_played' => 0])->save();

            // Lobbies: every player's Keys entry fee is deducted here, in the transaction that starts
            // the game (once per player and table; any failure rolls the whole start back).
            if ($table->room->isLobby()) {
                app(LobbyEntryService::class)->chargeKeys($table, $table->room, GamePlayer::query()->with('user')->where('game_table_id', $table->id)->get());
            }

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
                    // Still offline: their finished rounds are settled; they leave the match (and the
                    // app takes them back to the lobby when they return).
                    $player->delete();
                    event(new TableEvent($table->id, GameEvents::PLAYER_LEFT, ['user_id' => $player->user_id, 'reason' => 'inactive']));
                    $player->user?->notify((new \App\Notifications\RemovedFromMatch($table, $table->rounds_played))->afterCommit());
                }
            }

            $players = $players->filter(fn (GamePlayer $p) => $p->exists)->values();
            $balances = $players->mapWithKeys(fn (GamePlayer $p) => [$p->user_id => $this->wallets->for($p->user, $currency)->balance])->all();
            // To take part a player must cover 2× their bet: the bet they selected in the lobby
            // (lobbies), otherwise the room's minimum bet.
            $eligible = $players->filter(fn (GamePlayer $p) => $p->is_connected && $balances[$p->user_id] >= max($minReserve, $room->isLobby() ? LobbyEntryService::betOf($room, $p) * LobbyEntryService::betMultiple() : 0))->values();

            if ($eligible->count() < 2) {
                $this->end($table, $players->count() < 2 ? 'not_enough_players' : 'not_enough_eligible_players');

                return null;
            }

            $previousBanker = $table->banker_user_id;
            [$banker, $reason, $bankerChecks] = $this->chooseBanker($table, $eligible, $balances);

            if ($banker === null) {
                // Nobody holds the banker reserve (6× the maximum bet): pause and retry; end the
                // match only if nobody qualifies within pause_timeout_seconds.
                $since = $table->paused_at ?? now();
                if (now()->diffInSeconds($since, true) >= (int) config('pusoy.banker.pause_timeout_seconds', 300)) {
                    $this->end($table, 'no_eligible_banker');

                    return null;
                }
                $retry = now()->addSeconds(max(1, (int) config('pusoy.banker.pause_retry_seconds', 15)));
                if (! $table->paused_at) {
                    event(new TableEvent($table->id, GameEvents::MATCH_PAUSED, [
                        'reason' => 'no_eligible_banker',
                        'message' => 'No eligible banker: a banker needs '.Points::format($room->bankerReserve()).' Chips (6× the maximum bet). The game resumes as soon as a player qualifies.',
                        'banker_reserve' => Points::decimal($room->bankerReserve()),
                    ]));
                }
                $table->forceFill(['paused_at' => $since, 'pause_reason' => 'no_eligible_banker', 'next_round_at' => $retry])->save();
                StartNextRound::dispatch($table->id)->delay($retry)->afterCommit();

                return null;
            }

            if ($table->paused_at) {
                $table->forceFill(['paused_at' => null, 'pause_reason' => null])->save();
                event(new TableEvent($table->id, GameEvents::MATCH_RESUMED, ['banker_user_id' => $banker->user_id]));
            }

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
                    // Round history: clockwise seat order and the banker eligibility checks of this round.
                    'seat_order' => $players->sortBy('seat')->map(fn (GamePlayer $p) => ['user_id' => $p->user_id, 'seat' => $p->seat])->values()->all(),
                    'banker_selection' => ['reason' => $reason, 'required' => $room->bankerReserve(), 'checks' => $bankerChecks],
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
                // Who was skipped for not holding the banker reserve (no balances are broadcast).
                'skipped_user_ids' => collect($bankerChecks)->where('eligible', false)->pluck('user_id')->values()->all(),
                'banker_reserve' => Points::decimal($room->bankerReserve()),
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
     * Choose this round's banker. Only a player whose Chips balance is at least the room's banker
     * reserve (banker_reserve_multiple × the maximum permitted bet) may bank; anyone below it is
     * skipped and the next player clockwise is checked, until an eligible banker is found.
     *
     * Round Bank: the creator banks first (or, if they cannot, the next eligible player clockwise
     * from them); after that the turn passes clockwise (seat order) from the previous banker, who
     * comes last — so nobody banks twice in a row while someone else qualifies.
     * Banker Mode: the creator banks while eligible; otherwise the eligible player with the highest
     * balance takes over (ties: lowest seat).
     *
     * Returns [banker or null when nobody qualifies, reason, checks]; `checks` lists every player
     * looked at in order with the result, for the round's history.
     *
     * @param  Collection<int, GamePlayer>  $eligible  players taking part in this round
     * @param  array<int, int>  $balances
     * @return array{0: GamePlayer|null, 1: string, 2: list<array{user_id: int, seat: int, balance: int, required: int, eligible: bool}>}
     */
    public function chooseBanker(GameTable $table, Collection $eligible, array $balances): array
    {
        $required = $table->room->bankerReserve();
        $bySeat = $eligible->sortBy('seat')->values();
        $checks = [];
        $check = function (GamePlayer $p) use ($balances, $required, &$checks): bool {
            $ok = ($balances[$p->user_id] ?? 0) >= $required;
            $checks[] = ['user_id' => $p->user_id, 'seat' => $p->seat, 'balance' => (int) ($balances[$p->user_id] ?? 0), 'required' => $required, 'eligible' => $ok];

            return $ok;
        };

        if ($table->game_mode === GameMode::Banker) {
            $qualified = $bySeat->filter(fn (GamePlayer $p) => $check($p))->values();

            if ($table->banker_user_id && ($current = $qualified->firstWhere('user_id', $table->banker_user_id))) {
                return [$current, 'continues', $checks];
            }

            if ($table->rounds_played === 0 && $table->banker_user_id === null && ($creator = $qualified->firstWhere('user_id', $table->creator_user_id))) {
                return [$creator, 'room_creator', $checks];
            }

            $richest = $qualified->sort(fn (GamePlayer $a, GamePlayer $b) => [$balances[$b->user_id], $a->seat] <=> [$balances[$a->user_id], $b->seat])->first();

            return [$richest, $richest ? ($table->banker_user_id ? 'replacement_highest_balance' : 'highest_balance') : 'no_eligible_banker', $checks];
        }

        if ($bySeat->isEmpty()) {
            return [null, 'no_eligible_banker', $checks];
        }

        // Clockwise order to check, starting at the right seat.
        if ($table->banker_user_id === null) {
            $creatorSeat = $bySeat->firstWhere('user_id', $table->creator_user_id)?->seat;
            $startSeat = $creatorSeat ?? $bySeat->first()->seat;
            $order = $bySeat->filter(fn (GamePlayer $p) => $p->seat >= $startSeat)->concat($bySeat->filter(fn (GamePlayer $p) => $p->seat < $startSeat))->values();
            $firstReason = $creatorSeat !== null ? 'room_creator' : 'first_eligible';
        } else {
            $lastSeat = GameCard::query()->where('game_session_id', $table->current_session_id)->where('user_id', $table->banker_user_id)->value('seat')
                ?? GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $table->banker_user_id)->value('seat')
                ?? 0;
            $order = $bySeat->filter(fn (GamePlayer $p) => $p->seat > $lastSeat)->concat($bySeat->filter(fn (GamePlayer $p) => $p->seat <= $lastSeat))->values();
            // The previous banker is checked last (only banks again when nobody else qualifies).
            $order = $order->reject(fn (GamePlayer $p) => $p->user_id === $table->banker_user_id)
                ->concat($order->filter(fn (GamePlayer $p) => $p->user_id === $table->banker_user_id))->values();
            $firstReason = 'rotation';
        }

        foreach ($order as $i => $candidate) {
            if ($check($candidate)) {
                return [$candidate, $i === 0 ? $firstReason : 'rotation_skipped_ineligible', $checks];
            }
        }

        return [null, 'no_eligible_banker', $checks];
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

            // Lobbies: only the room's chips (5 / 10 / 15 % of the Minimum Entry, 1:1) can be bet.
            if (! empty($config['bet_chips']) && ! in_array($amount, array_map('intval', $config['bet_chips']), true)) {
                throw new BusinessRuleException('Choose one of this table\'s chips: '.implode(', ', array_map(fn ($c) => Points::decimal((int) $c), $config['bet_chips'])).' Chips.', 422, 'invalid_bet');
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
            $meta = ['table_id' => $session->game_table_id, 'round' => $session->round_number, 'bet' => $amount, 'bet_type' => $auto ? 'AUTO' : 'MANUAL'];

            $playerTx = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::GameEntry,
                currency: $currency,
                source: $locked[$playerWallet->id],
                destination: $escrow,
                amount: $reserve,
                reason: ($auto ? 'Auto-bet (time expired) ' : 'Bet ')."{$this->fmt($amount, $currency)} round {$session->round_number} (2× reserve)",
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
                'bet_type' => $auto ? 'AUTO' : 'MANUAL',
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
            $skipped = [];

            foreach (array_diff($session->config['participants'] ?? [], $bet) as $userId) {
                if (! in_array($userId, $connected, true)) {
                    continue;
                }

                // Timeout: the minimum bet of the table's entry tier (100 → 5 · 500 → 20 · 1,000 → 50),
                // checked like any bet (2× in the wallet, the banker's cover). Once per player and round:
                // the session row is locked and placeBet refuses a second bet.
                $auto = (int) $session->config['min_bet'];
                try {
                    $this->placeBet(User::query()->findOrFail($userId), $session, $auto, auto: true);
                } catch (BusinessRuleException $e) {
                    // Cannot afford it / the banker cannot cover it: the player sits this round out, and is told why.
                    $skipped[$userId] = $e->getMessage();
                }
            }

            $session->refresh();
            if ($skipped !== []) {
                // Kept with the round, so each player's screen can say why no automatic bet was placed.
                $session->forceFill(['config' => $session->config + ['auto_bet_skipped' => $skipped]])->save();
                foreach ($skipped as $userId => $why) {
                    event(new \App\Events\Game\UserEvent((int) $userId, 'bet.auto_skipped', ['session_id' => $session->id, 'message' => $why]));
                }
            }

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

        // Dealt like Single Player (and the deal animation): one card at a time, clockwise round the
        // four seats, starting with the seat after the banker; each player keeps their own seat's 13.
        $deck = Deck::shuffled($session->server_seed);
        $bankerSeat = (int) ($seats[$session->banker_user_id] ?? 1);
        // Only the seats in this round (2 to 4 players), clockwise from the seat after the banker.
        $first = ($bankerSeat % 4) + 1;
        $order = array_values(array_map('intval', $seats->values()->all()));
        usort($order, fn (int $a, int $b) => (($a - $first + 4) % 4) <=> (($b - $first + 4) % 4));
        $hands = Deck::dealTo($deck, $order, 13);
        $dealt = [];

        foreach ($seats as $userId => $seat) {
            GameCard::create(['game_session_id' => $session->id, 'user_id' => $userId, 'seat' => $seat, 'cards' => $hands[(int) $seat]]);
            $dealt[$userId] = $hands[(int) $seat];
        }

        // The players watch the shuffle and the clockwise deal first: that time is not taken from
        // their arranging time.
        $deadline = now()->addSeconds((int) $session->config['arrangement_seconds'] + (int) config('pusoy.banker.deal_animation_seconds', 6));
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
    public function declareLucky(User $user, GameSession $session, GameEngine $engine, ?array $rows = null): GameSubmission
    {
        return DB::transaction(function () use ($user, $session, $engine, $rows) {
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

            // Validated on the actual 13 dealt cards. A declaration that does not qualify is still
            // accepted and locks the hand: it costs 2 × bet in settlement (the declaration decides the
            // round, so the arrangement is not judged too). Its rows are kept exactly as the player
            // had them (sent now, else their saved rows, else as dealt) for the reveal.
            $lucky = LuckyHand::detect($card->cards);
            $arrangement = $lucky['arrangement'] ?? $this->currentRows($card, $rows);
            $submission = GameSubmission::create([
                'game_session_id' => $session->id,
                'user_id' => $user->id,
                'front' => $arrangement->front,
                'middle' => $arrangement->middle,
                'back' => $arrangement->back,
                'is_foul' => false,
                'is_auto' => false,
                'lucky_type' => $lucky['type'] ?? null,
                'lucky_failed' => $lucky === null,
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

    /** The player's rows as they are: the ones just sent, else the saved draft, else as dealt. */
    private function currentRows(GameCard $card, ?array $rows): \App\Game\Arrangement
    {
        foreach ([$rows, is_array($card->draft) ? $card->draft : null] as $candidate) {
            if ($candidate) {
                try {
                    return \App\Game\ArrangementValidator::build($card->cards, $candidate['front'] ?? null, $candidate['middle'] ?? null, $candidate['back'] ?? null);
                } catch (\App\Game\Exceptions\InvalidArrangementException) {
                    // not this one
                }
            }
        }

        return GameEngine::asDealt($card->cards);
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
            $submissions->map(fn (GameSubmission $s) => (bool) $s->lucky_failed)->all(),
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
                'lucky_failed' => (bool) ($row['lucky_failed'] ?? false),
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

        $table->forceFill(['status' => TableStatus::Closed, 'closed_at' => now(), 'end_reason' => $reason, 'next_round_at' => null, 'paused_at' => null, 'pause_reason' => null])->save();

        $room = $table->room;

        // Lobbies: a match that ends before any round was completed refunds the Keys entry fees.
        if ($room->isLobby() && (int) $table->rounds_played === 0 && config('pusoy.lobby.refund_keys_if_no_round_completed', true)) {
            app(LobbyEntryService::class)->refundKeys($table, $reason);
        }

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
    /** Shown whenever a leave is refused because the round is past its Betting Phase. */
    public const LEAVE_BLOCKED = 'You cannot leave the game once the betting phase has ended. Please wait until the round is complete.';

    /**
     * Leave a match only in the Betting Phase: CanLeaveGame = (current round is BETTING), from the
     * authoritative round state. Null = you may leave now; otherwise why not.
     *
     *  - Betting (deadline not passed): yes — unless you already have Chips in this round (you placed a
     *    bet, or you bank it and a bet is covered). Bets are never cancelled or refunded on leaving (no
     *    such rule exists): you stay until the round is complete and can leave in the next Betting Phase.
     *    A banker leaving before any bet voids that round (nothing was held) and the next round starts
     *    with another banker (afterLeave).
     *  - Dealing, arranging, submitted, reveal, scoring, results and the pause before the next round:
     *    no, for everyone seated.
     *  - Not in a round: before the match starts (lobby), a match paused for lack of an eligible
     *    banker (no round is being played), or a closed table — the existing rules apply.
     */
    public function leaveBlock(GameTable $table, User $user, bool $lock = false): ?string
    {
        if ($table->status !== TableStatus::InGame || ! $table->current_session_id) {
            return null;
        }

        $query = GameSession::query()->whereKey($table->current_session_id);
        $session = ($lock ? $query->lockForUpdate() : $query)->first();

        if ($session === null) {
            return null;
        }

        if ($session->status === GameStatus::Betting) {
            // Past the deadline the betting is over even if the auto-bets / deal have not run yet.
            if ($session->betting_deadline?->isPast()) {
                return self::LEAVE_BLOCKED;
            }
            // The banker has Chips at stake only once a bet is covered; before that the round is simply
            // re-dealt with another banker (afterLeave).
            if ($session->banker_user_id === $user->id && GameBet::query()->where('game_session_id', $session->id)->exists()) {
                return 'You are the banker this round and bets are already covered. You can leave once the round is complete.';
            }
            if (GameBet::query()->where('game_session_id', $session->id)->where('user_id', $user->id)->exists()) {
                return 'You have placed a bet this round. You can leave once the round is complete.';
            }

            return null;
        }

        // A paused match (no eligible banker) is not playing a round.
        if ($session->status->isFinal() && $table->paused_at !== null) {
            return null;
        }

        return self::LEAVE_BLOCKED;
    }

    /** Throws unless leaveBlock() allows it (call inside the transaction that removes the seat). */
    public function assertCanLeave(GameTable $table, User $user): void
    {
        if ($why = $this->leaveBlock($table, $user, lock: true)) {
            throw new BusinessRuleException($why, 409, 'leave_not_allowed');
        }
    }

    public function afterLeave(GameTable $table, ?int $leftUserId = null): void
    {
        $remaining = GamePlayer::query()->where('game_table_id', $table->id)->orderBy('seat')->get();

        // The banker left during Betting before any bet (leaveBlock allows only that): nothing is held,
        // so this round is void (not counted) and the next one starts now with another banker.
        if ($leftUserId !== null && $table->status === TableStatus::InGame && $table->current_session_id) {
            $session = GameSession::query()->whereKey($table->current_session_id)->lockForUpdate()->first();
            if ($session?->status === GameStatus::Betting && $session->banker_user_id === $leftUserId
                && ! GameBet::query()->where('game_session_id', $session->id)->exists()) {
                $session->forceFill(['status' => GameStatus::Cancelled, 'cancelled_at' => now(), 'cancel_reason' => 'banker_left'])->save();
                event(new TableEvent($table->id, GameEvents::GAME_CANCELLED, ['session_id' => $session->id, 'reason' => 'banker_left']));
                if ($remaining->count() >= 2) {
                    $this->startRound($table);

                    return;
                }
            }
        }

        // Someone left during a lobby's pre-match countdown: stop it and withdraw everyone's Start.
        if ($table->countdown_ends_at) {
            $table->forceFill(['countdown_ends_at' => null])->save();
            GamePlayer::query()->where('game_table_id', $table->id)->update(['is_ready' => false]);
            event(new TableEvent($table->id, GameEvents::COUNTDOWN_CANCELLED, ['reason' => 'player_left']));
        }

        if (in_array($table->status, [TableStatus::WaitingForPlayers, TableStatus::Ready], true)) {
            if ($remaining->isEmpty()) {
                $this->end($table, 'abandoned');
            } elseif (! $remaining->contains('user_id', $table->creator_user_id)) {
                $table->forceFill(['creator_user_id' => $remaining->first()->user_id])->save();
                // A lobby's ownership (settings, Start) moves with it to the next seated player.
                $room = $table->room;
                if ($room->isLobby()) {
                    $room->forceFill(['owner_id' => $remaining->first()->user_id])->save();
                }
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
            ->groupBy('game_results.user_id', 'users.name', 'users.avatar', 'player_profiles.display_name')
            ->selectRaw('game_results.user_id, users.name, users.avatar, player_profiles.display_name, COUNT(*) as rounds, SUM(game_results.net_amount) as net,
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
            'avatar' => Avatars::for($r->avatar, (int) $r->user_id),
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
