<?php

namespace App\Services\Game;

use App\Enums\Currency;
use App\Enums\GameMode;
use App\Enums\RoomStatus;
use App\Enums\RoomVisibility;
use App\Enums\TableStatus;
use App\Events\Game\GameEvents;
use App\Events\Game\LobbyEvent;
use App\Events\Game\TableEvent;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientBalanceException;
use App\Models\GameInvitation;
use App\Models\GamePlayer;
use App\Models\GameRoom;
use App\Models\GameTable;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Multiplayer lobbies (the 553 Lobby): player-created, four-seat Chips rooms
 * on top of the existing rooms / tables / 12-round banker matches.
 *
 * - A lobby is a game_room with a public Lobby ID (`lobby_code`), an optional
 *   password (stored hashed; set = private lobby), an entry tier (Minimum Entry 100 / 500 /
 *   1,000 Chips, each with its own three bets and Keys fee — LobbyEntryService) and a
 *   Preparation Time (the arrangement timer). Round Bank is the only game type (the creator
 *   banks first, then the banker rotates clockwise; Banker Mode can no longer be created).
 * - Every player selects one of the tier's bets and must hold Chips ≥ the Minimum Entry and
 *   ≥ 2× that bet, plus the Keys fee — checked on join, on Start and when the game starts. The
 *   Keys are deducted only when the game starts (refunded if no round is ever completed).
 * - Exactly four players: the owner presses Start once all four are seated and
 *   the others are ready (`owner_starts`; tables never start on their own).
 * - Money is the existing banker-match money: each round's bets are held in
 *   escrow from the players' Chips wallets and settled by BankerMatchService, with
 *   idempotent ledger entries. The minimum bet is Minimum Entry ÷ 10, so a
 *   player holding the Minimum Entry can always cover a round (worst case as the
 *   banker against three players: 3 × 2 × bet = 6 × bet).
 * - Every change is broadcast as `lobby.updated` on the public `lobbies` channel.
 */
class LobbyService
{
    /** Preparation Time choices (seconds to arrange the 13 cards). */
    public const PREPARATION_SECONDS = [30, 45, 60, 75];

    public const PER_PAGE = 5;

    /** The synchronized pre-match countdown (3 → 2 → 1). */
    public const COUNTDOWN_SECONDS = 3;

    /** A player in the waiting room not heard from for this long counts as disconnected. */
    public const PRESENCE_SECONDS = 6;

    /** Table events that change what the Lobby screen shows. */
    public const TABLE_EVENTS_THAT_CHANGE_LOBBIES = [
        GameEvents::PLAYER_SEATED,
        GameEvents::PLAYER_UPDATED,
        GameEvents::COUNTDOWN_STARTED,
        GameEvents::COUNTDOWN_CANCELLED,
        GameEvents::PLAYER_JOINED,
        GameEvents::PLAYER_LEFT,
        GameEvents::PLAYER_READY,
        GameEvents::TABLE_FULL,
        GameEvents::MATCH_STARTED,
        GameEvents::MATCH_COMPLETED,
        GameEvents::PLAYER_DISCONNECTED,
        GameEvents::PLAYER_RECONNECTED,
    ];

    public function __construct(
        private readonly TableService $tables,
        private readonly WalletService $wallets,
        private readonly LobbyEntryService $entry,
    ) {}

    /** Minimum Entry choices (the entry tiers), in Chips. */
    public static function minEntries(): array
    {
        return LobbyEntryService::minEntries();
    }

    // ------------------------------------------------------------------
    // Create
    // ------------------------------------------------------------------

    /**
     * @param  array{name: string, password?: ?string, game_mode?: string, min_entry: int, preparation_seconds: int}  $data
     */
    public function create(User $user, array $data): GameRoom
    {
        $this->assertPlayer($user);

        $room = DB::transaction(function () use ($user, $data) {
            // Serialise this player's requests: a double tap cannot create two lobbies.
            User::query()->whereKey($user->id)->lockForUpdate()->first();

            if ($this->tables->activeSeat($user)) {
                throw new BusinessRuleException('Leave your current table before creating a lobby.', 409, 'already_seated');
            }

            // The tier decides the bets and the Keys fee; Round Bank is the only game type.
            $tier = LobbyEntryService::tier((int) $data['min_entry']);
            $minEntry = Points::toMinor((string) $data['min_entry']);
            $bets = array_map(fn (int $b) => Points::toMinor((string) $b), $tier['bets']);

            $password = isset($data['password']) && $data['password'] !== '' ? $data['password'] : null;
            $mode = GameMode::RoundBank;

            $room = GameRoom::create([
                'name' => trim($data['name']),
                'slug' => Str::slug($data['name']).'-'.Str::lower(Str::random(6)),
                'description' => $mode->label().' lobby by '.$user->username,
                'currency' => Currency::CH,
                'entry_amount' => min($bets),
                'payout_mode' => 'winner_takes_all',
                'game_mode' => $mode,
                'rounds_total' => (int) config('pusoy.banker.rounds', 12),
                'platform_fee_bps' => 0,
                'arrangement_seconds' => (int) $data['preparation_seconds'],
                'betting_seconds' => config('pusoy.banker.default_betting_seconds'),
                'min_players' => self::MIN_PLAYERS, // starts with 2–4 seated (BankerMatchService::minPlayers)
                'max_players' => 4,
                'tie_handling' => 'split_equally',
                'timeout_policy' => 'auto_arrange',
                'visibility' => $password ? RoomVisibility::Private : RoomVisibility::Public,
                'status' => RoomStatus::Active,
                'invite_code' => strtoupper(Str::random(8)),
                'lobby_code' => $this->newLobbyCode(),
                'lobby_password' => $password ? Hash::make($password) : null,
                'min_entry' => $minEntry,
                'bet_options' => $bets,
                'entry_keys' => $tier['keys'],
                'owner_starts' => true,
                'owner_id' => $user->id,
                'created_by' => $user->id,
            ]);

            // The creator picks no bet (bets are chosen in the game each round); their wallet is checked
            // against the tier's smallest bet like anyone joining (Keys are paid at the start).
            $bet = min($bets);
            $this->entry->assertCanPlay($user, $room, $bet, lock: true);

            // The creator takes seat 1 and is the lobby owner (and the first banker).
            $this->tables->join($user, $room, $room->invite_code)->forceFill(['selected_bet' => $bet])->save();

            return $room;
        });

        AuditLogger::log($user, 'lobby.created', $room, null, ['lobby_code' => $room->lobby_code, 'private' => $room->isPrivateLobby(), 'game_mode' => $room->game_mode->value]);
        event(new LobbyEvent($room->id, 'created'));

        return $room;
    }

    /** A unique 6-digit Lobby ID. */
    private function newLobbyCode(): string
    {
        do {
            $code = (string) random_int(100000, 999999);
        } while (GameRoom::query()->where('lobby_code', $code)->exists());

        return $code;
    }

    // ------------------------------------------------------------------
    // List
    // ------------------------------------------------------------------

    /**
     * Open lobbies (not closed or finished), 5 per page, with counts per tab.
     *
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function list(User $user, string $tab = 'all', ?string $search = null, int $page = 1): array
    {
        $base = GameRoom::query()->lobby()->active()
            ->whereHas('tables', fn ($q) => $q->where('status', '!=', TableStatus::Closed->value));

        if ($search !== null && trim($search) !== '') {
            $term = trim($search);
            $base->where(fn ($q) => $q->where('lobby_code', 'like', $term.'%')->orWhere('name', 'like', '%'.addcslashes($term, '%_\\').'%'));
        }

        $counts = [
            'all' => (clone $base)->count(),
            'public' => (clone $base)->whereNull('lobby_password')->count(),
            'private' => (clone $base)->whereNotNull('lobby_password')->count(),
        ];

        $query = clone $base;
        if ($tab === 'public') {
            $query->whereNull('lobby_password');
        } elseif ($tab === 'private') {
            $query->whereNotNull('lobby_password');
        }

        $total = $counts[$tab] ?? $counts['all'];
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page = min(max(1, $page), $pages);

        // Rooms with free seats first (fullest first, so tables fill up), then newest.
        $rooms = $query->with(['owner:id,username,name', 'tables' => fn ($q) => $q->where('status', '!=', TableStatus::Closed->value)->withCount('players')])
            ->get()
            ->sortBy(fn (GameRoom $r) => [($this->openTable($r)?->players_count ?? 0) >= 4 ? 1 : 0, -($this->openTable($r)?->players_count ?? 0), -$r->id])
            ->values();

        $seat = $this->tables->activeSeat($user);
        $seatRoom = $seat ? GameRoom::query()->find($seat->table->game_room_id) : null;
        // Your lobby (to return to); a seat at a non-lobby table blocks joining, so say where it is.
        $mine = $seatRoom?->isLobby() ? $seatRoom->id : null;
        $slice = $rooms->slice(($page - 1) * self::PER_PAGE, self::PER_PAGE)->values();

        return [
            'data' => $slice->map(fn (GameRoom $r) => $this->summary($r, $mine))->all(),
            'meta' => [
                'tab' => $tab,
                'page' => $page,
                'pages' => $pages,
                'per_page' => self::PER_PAGE,
                'total' => $total,
                'counts' => $counts,
                'my_lobby_id' => $mine,
                'other_table_id' => $seat && ! $mine ? $seat->game_table_id : null,
                'balance' => Points::decimal($this->wallets->for($user, Currency::CH)->balance),
                'keys' => Points::decimal($this->wallets->for($user, Currency::KY)->balance),
                'tiers' => $this->tierList(),
            ],
        ];
    }

    private function openTable(GameRoom $room): ?GameTable
    {
        return $room->relationLoaded('tables')
            ? $room->tables->first()
            : GameTable::query()->where('game_room_id', $room->id)->where('status', '!=', TableStatus::Closed->value)->withCount('players')->first();
    }

    /**
     * One row of the lobby list (public info only).
     *
     * @return array<string, mixed>
     */
    public function summary(GameRoom $room, ?int $myRoomId = null): array
    {
        $table = $this->openTable($room);
        $players = (int) ($table?->players_count ?? ($table ? $table->players()->count() : 0));
        $status = match (true) {
            $table === null => 'closed',
            $table->status === TableStatus::InGame => 'in_game',
            $players >= 4 => 'full',
            default => 'waiting',
        };

        return [
            'id' => $room->id,
            'lobby_id' => $room->lobby_code,
            'name' => $room->name,
            'game_mode' => $room->game_mode->value,
            'game_mode_label' => $room->game_mode->label(),
            'min_entry' => (int) intdiv((int) $room->min_entry, Points::SCALE),
            'min_bet' => Points::decimal($room->minBet()),
            'bet_chips' => array_map(fn (int $c) => Points::decimal($c), $room->betChips() ?? [$room->minBet()]),
            // Keys each player pays when the game starts, and the Chips multiple of the bet to hold.
            'key_fee' => (int) $room->entry_keys,
            'bet_multiple' => LobbyEntryService::betMultiple(),
            'preparation_seconds' => $room->arrangement_seconds,
            'players' => $players,
            'max_players' => 4,
            'type' => $room->isPrivateLobby() ? 'private' : 'public',
            'status' => $status,
            'owner' => $room->owner?->username,
            'is_mine' => $myRoomId === $room->id,
            'can_join' => $myRoomId === $room->id || ($table !== null && $players < 4 && $table->rounds_played < $table->rounds_total),
        ];
    }

    // ------------------------------------------------------------------
    // Waiting room
    // ------------------------------------------------------------------

    /**
     * Lobby details and its four seats for the waiting room.
     *
     * @return array<string, mixed>
     */
    public function show(User $user, GameRoom $room, ?BankerMatchService $match = null): array
    {
        $this->assertLobby($room);
        $table = $this->openTable($room);

        // Looking at the lobby keeps you present, and runs the server's countdown / housekeeping.
        if ($table && $match) {
            $this->touch($user, $table);
            $this->tick($table, $match);
            $room->refresh();
            $room->unsetRelation('tables');
            $table = $this->openTable($room) ?? GameTable::query()->find($table->id);
        }

        $players = $table ? GamePlayer::query()->with('user.profile')->where('game_table_id', $table->id)->orderBy('seat')->get() : collect();
        $bankerId = $table?->banker_user_id ?? $table?->creator_user_id;

        $seats = [];
        foreach ([1, 2, 3, 4] as $seat) {
            $p = $players->firstWhere('seat', $seat);
            $seats[] = $p ? [
                'seat' => $seat,
                'user_id' => $p->user_id,
                'name' => $p->user->profile?->display_name ?? $p->user->name,
                'avatar' => $p->user->avatarId(),
                'username' => $p->user->username,
                // occupied = seat confirmed; reserved = held by a player who has not confirmed yet
                'state' => $p->seat_confirmed ? 'occupied' : 'reserved',
                'seat_confirmed' => (bool) $p->seat_confirmed,
                'is_ready' => (bool) $p->is_ready,
                'is_connected' => (bool) $p->is_connected,
                'is_owner' => $p->user_id === $room->owner_id,
                'is_banker' => $p->user_id === $bankerId,
                'is_you' => $p->user_id === $user->id,
                'bet' => Points::decimal(LobbyEntryService::betOf($room, $p)),
            ] : ['seat' => $seat, 'user_id' => null, 'state' => 'available'];
        }

        $seated = $players->firstWhere('user_id', $user->id);
        $allConfirmed = $players->count() >= self::MIN_PLAYERS && $players->every('seat_confirmed');
        $inGame = $table?->status === TableStatus::InGame;
        $counting = (bool) $table?->countdown_ends_at;
        $unconfirmed = $players->where('seat_confirmed', false)->count();
        $notStarted = $players->where('is_ready', false)->count();

        return $this->summary($room, $seated ? $room->id : null) + [
            'table_id' => $table?->id,
            'table_status' => $table?->status->value,
            'seats' => $seats,
            'is_owner' => $room->owner_id === $user->id,
            'is_seated' => $seated !== null,
            'my_seat' => $seated?->seat,
            'my_seat_confirmed' => (bool) $seated?->seat_confirmed,
            'my_ready' => (bool) $seated?->is_ready,
            'all_confirmed' => $allConfirmed,
            // "2/4 Players": a match starts with 2 to 4.
            'seated_count' => $players->count(),
            'min_players' => self::MIN_PLAYERS,
            'ready_count' => $players->where('is_ready', true)->count(),
            'countdown_ends_at' => $table?->countdown_ends_at?->toIso8601ZuluString('millisecond'),
            'server_time' => now()->toIso8601ZuluString('millisecond'),
            'banker_rule' => $room->game_mode === GameMode::Banker
                ? 'The lobby owner banks every round.'
                : 'Round Bank · 12 rounds: the owner banks first, then the banker rotates clockwise. A banker needs '.Points::format($room->bankerReserve()).' Chips (6× the '.Points::format($room->maxBet()).' maximum bet); players below that are skipped.',
            'my_bet' => $seated ? Points::decimal(LobbyEntryService::betOf($room, $seated)) : null,
            'my_required_chips' => $seated ? Points::decimal(LobbyEntryService::requiredChips($room, LobbyEntryService::betOf($room, $seated))) : null,
            'my_chips' => Points::decimal($this->wallets->for($user, Currency::CH)->balance),
            'my_keys' => Points::decimal($this->wallets->for($user, Currency::KY)->balance),
            'can_press_start' => $seated !== null && $allConfirmed && ! $inGame,
            'start_hint' => match (true) {
                $table === null => 'This lobby is closed.',
                $inGame => 'The game is starting…',
                $counting => 'Get ready…',
                $players->count() < self::MIN_PLAYERS => self::MIN_PLAYERS_MESSAGE,
                ! $allConfirmed => $unconfirmed === 1 ? 'Waiting for 1 player to confirm a seat…' : "Waiting for {$unconfirmed} players to confirm their seats…",
                $notStarted > 0 => $seated?->is_ready ? "Waiting for {$notStarted} more to press Start…" : 'All seats confirmed — press Start!',
                default => 'Starting…',
            },
        ];
    }

    // ------------------------------------------------------------------
    // Join / Quick Join
    // ------------------------------------------------------------------

    public function join(User $user, GameRoom $room, ?string $password = null, ?int $bet = null): GamePlayer
    {
        $this->assertLobby($room);
        $this->assertPlayer($user);

        $seat = $this->tables->activeSeat($user);
        if ($seat && $seat->table->game_room_id === $room->id) {
            return $seat; // already here: joining again changes nothing
        }

        // The selected bet (the lobby's smallest when none is given) and the wallet / Keys checks.
        $bet ??= min($room->betChips() ?? [$room->minBet()]);
        $this->entry->assertCanPlay($user, $room, $bet);

        // A pending, unexpired invitation from a player in the lobby (Friends → Invite) lets you in
        // without the private lobby's password — that is what tapping the invitation notification does.
        $invitation = $room->isPrivateLobby() && ! $password ? $this->pendingInvitation($user, $room) : null;
        if ($room->isPrivateLobby() && ! $invitation && ! Hash::check((string) $password, (string) $room->lobby_password)) {
            throw new BusinessRuleException($password ? 'Incorrect lobby password.' : 'This is a private lobby — enter its password.', 422, 'wrong_password');
        }

        if ($room->status !== RoomStatus::Active || ($open = $this->openTable($room)) === null) {
            throw new BusinessRuleException('This lobby is closed.', 409, 'room_closed');
        }
        // A match can start with free seats: once its countdown runs, nobody new sits down (a late
        // arrival would only cancel the start). Should one slip in, tick() still cancels the countdown.
        if ($open->countdown_ends_at) {
            throw new BusinessRuleException('This game is starting — try another lobby or join again in a moment.', 409, 'countdown_running');
        }

        // TableService locks the player and the room, re-checks the seat count and the balance.
        $seat = $this->tables->join($user, $room, $room->invite_code);
        $seat->forceFill(['selected_bet' => $bet])->save();
        GameInvitation::query()->where('game_room_id', $room->id)->where('invitee_id', $user->id)->where('status', 'pending')->update(['status' => 'accepted']);

        return $seat;
    }

    /** A pending invitation to this lobby that has not expired. */
    private function pendingInvitation(User $user, GameRoom $room): ?GameInvitation
    {
        return GameInvitation::query()
            ->where('game_room_id', $room->id)->where('invitee_id', $user->id)->where('status', 'pending')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->first();
    }

    /**
     * Join the best open public lobby you can afford: rooms with free seats only (fullest first,
     * then oldest), never a private lobby. Tries the next candidate if one fills up meanwhile.
     */
    public function quickJoin(User $user): GamePlayer
    {
        $this->assertPlayer($user);

        if ($this->tables->activeSeat($user)) {
            throw new BusinessRuleException('You are already in a lobby.', 409, 'already_seated');
        }

        $balance = $this->wallets->for($user, Currency::CH)->balance;
        $reserve = (int) config('pusoy.banker.reserve_multiplier', 2);

        $candidates = GameRoom::query()->lobby()->active()->whereNull('lobby_password')
            ->where('min_entry', '<=', $balance)
            ->whereRaw('entry_amount * ? <= ?', [$reserve, $balance])
            ->with(['tables' => fn ($q) => $q->whereIn('status', [TableStatus::WaitingForPlayers->value, TableStatus::Ready->value])->withCount('players')])
            ->get()
            ->filter(fn (GameRoom $r) => ($t = $r->tables->first()) && $t->players_count < 4)
            ->sortBy(fn (GameRoom $r) => [-$r->tables->first()->players_count, $r->id])
            ->values();

        foreach ($candidates as $room) {
            // Quick Join takes the lobby's smallest bet; skip lobbies whose Chips / Keys you lack.
            $bet = min($room->betChips() ?? [$room->minBet()]);
            if ($this->entry->problem($user, $room, $bet)) {
                continue;
            }
            try {
                $seat = $this->tables->join($user, $room, $room->invite_code);
                $seat->forceFill(['selected_bet' => $bet])->save();

                return $seat;
            } catch (BusinessRuleException $e) {
                if (in_array($e->errorCode(), ['table_unavailable', 'room_closed'], true)) {
                    continue; // filled up or closed a moment ago: try the next one
                }
                throw $e;
            }
        }

        throw new BusinessRuleException('No open lobby matches your Chips and Keys right now — create one!', 404, 'no_lobby');
    }

    // ------------------------------------------------------------------
    // Owner actions
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // Choose Your Seat → Start → countdown → match
    // ------------------------------------------------------------------

    /**
     * Confirm (or change to) a seat. You hold exactly one seat while in the lobby; you can move to
     * any free seat until the countdown starts. Two players can never hold one seat (row lock here,
     * and the unique (table, seat) index as the last word). Changing seat withdraws your Start.
     */
    public function chooseSeat(User $user, GameRoom $room, int $seat): GamePlayer
    {
        $this->assertLobby($room);

        return DB::transaction(function () use ($user, $room, $seat) {
            $table = $this->lockedOpenTable($room);
            $this->assertBeforeCountdown($table);

            $player = GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $user->id)->lockForUpdate()->first()
                ?? throw new BusinessRuleException('Join this lobby first.', 404, 'not_seated');

            $holder = GamePlayer::query()->where('game_table_id', $table->id)->where('seat', $seat)->lockForUpdate()->first();
            if ($holder && $holder->user_id !== $user->id) {
                throw new BusinessRuleException('That seat is already taken — choose another one.', 409, 'seat_taken');
            }

            try {
                $player->forceFill(['seat' => $seat, 'seat_confirmed' => true, 'is_ready' => false, 'last_seen_at' => now(), 'is_connected' => true])->save();
            } catch (UniqueConstraintViolationException) {
                throw new BusinessRuleException('That seat was just taken — choose another one.', 409, 'seat_taken');
            }

            event(new TableEvent($table->id, GameEvents::PLAYER_SEATED, ['user_id' => $user->id, 'seat' => $seat]));

            return $player;
        });
    }

    /** A Multiplayer match starts with 2, 3 or 4 seated players (the table seats 4). */
    public const MIN_PLAYERS = 2;

    public const MIN_PLAYERS_MESSAGE = 'At least 2 players are required to start the game.';

    /**
     * Press (or withdraw) Start. Only with at least 2 players seated, every seated player's seat
     * confirmed (empty seats are fine). When everyone seated has pressed it, the server starts the
     * synchronized 3-second countdown; the match begins when it ends (tick) unless someone leaves,
     * withdraws or drops out first, or fewer than 2 remain.
     */
    public function pressStart(User $user, GameRoom $room, bool $ready, BankerMatchService $match): GameTable
    {
        $this->assertLobby($room);

        $table = DB::transaction(function () use ($user, $room, $ready) {
            $table = $this->lockedOpenTable($room);
            if ($table->status === TableStatus::InGame) {
                return $table; // already started (a late tap)
            }

            $players = GamePlayer::query()->where('game_table_id', $table->id)->lockForUpdate()->get();
            $me = $players->firstWhere('user_id', $user->id) ?? throw new BusinessRuleException('Join this lobby first.', 404, 'not_seated');

            // Revalidated on every Start: at least 2 players seated (empty seats are fine), every seated
            // player's seat confirmed. The countdown then needs everyone seated to have pressed Start.
            if ($ready && $players->count() < self::MIN_PLAYERS) {
                throw new BusinessRuleException(self::MIN_PLAYERS_MESSAGE, 409, 'not_enough_players');
            }
            if ($ready && ! $players->every('seat_confirmed')) {
                throw new BusinessRuleException('Every seated player must confirm their seat first.', 409, 'seats_not_confirmed');
            }
            // Your Chips (Minimum Entry and 2× your bet) and Keys are checked again before you start.
            if ($ready) {
                $this->entry->assertCanPlay($user, $room, LobbyEntryService::betOf($room, $me));
            }

            $me->forceFill(['is_ready' => $ready, 'last_seen_at' => now(), 'is_connected' => true])->save();
            event(new TableEvent($table->id, GameEvents::PLAYER_READY, ['user_id' => $user->id, 'is_ready' => $ready]));

            if (! $ready && $table->countdown_ends_at) {
                $this->cancelCountdown($table, 'player_cancelled');
            } elseif ($ready && ! $table->countdown_ends_at && $players->every(fn (GamePlayer $p) => $p->user_id === $user->id || $p->is_ready)) {
                $endsAt = now()->addSeconds(self::COUNTDOWN_SECONDS);
                $table->forceFill(['countdown_ends_at' => $endsAt])->save();
                event(new TableEvent($table->id, GameEvents::COUNTDOWN_STARTED, ['ends_at' => $endsAt->toIso8601ZuluString('millisecond'), 'seconds' => self::COUNTDOWN_SECONDS]));
            }

            return $table->refresh();
        });

        $this->tick($table, $match);

        return $table->refresh();
    }

    /**
     * Server-side housekeeping for one lobby table, run whenever someone looks at the lobby (and by
     * the scheduler): mark silent players disconnected, release seats of players gone too long
     * (before the match), cancel a countdown when anyone dropped out, and start the match when the
     * countdown has run out. Safe to run any number of times (row-locked, state re-checked).
     */
    public function tick(GameTable $table, BankerMatchService $match): void
    {
        $started = DB::transaction(function () use ($table, $match) {
            $table = GameTable::query()->whereKey($table->id)->lockForUpdate()->first();
            if (! $table || ! in_array($table->status, [TableStatus::WaitingForPlayers, TableStatus::Ready], true)) {
                return false;
            }

            $now = now();
            $players = GamePlayer::query()->with('user')->where('game_table_id', $table->id)->lockForUpdate()->get();

            foreach ($players as $p) {
                $seen = $p->last_seen_at ?? $p->created_at;
                if ($p->is_connected && $seen->lt($now->copy()->subSeconds(self::PRESENCE_SECONDS))) {
                    $p->forceFill(['is_connected' => false])->save();
                    event(new TableEvent($table->id, GameEvents::PLAYER_DISCONNECTED, ['user_id' => $p->user_id]));
                }
            }

            if ($table->countdown_ends_at) {
                // Fewer than 2 left, or anyone seated (a late joiner too) not confirmed, started and here.
                $missing = $players->count() < self::MIN_PLAYERS || ! $players->every(fn (GamePlayer $p) => $p->is_ready && $p->seat_confirmed && $p->is_connected);
                if ($missing) {
                    $this->cancelCountdown($table, 'player_disconnected');
                } elseif ($now->gte($table->countdown_ends_at)) {
                    $table->forceFill(['countdown_ends_at' => null])->save();
                    // Last check before the game starts (wallets locked): Chips and Keys of all four.
                    $failing = $this->entry->failing($table->room, $players, lock: true);
                    if ($failing !== []) {
                        $this->cancelCountdown($table, 'requirements_not_met', ['players' => array_map(fn ($f) => ['user_id' => $f['user_id'], 'username' => $f['username'], 'message' => $f['message']], $failing)]);

                        return false;
                    }
                    try {
                        // Starts the match and deducts every player's Keys in this same transaction.
                        $started = $match->maybeStart($table, byOwner: true);
                    } catch (BusinessRuleException|InsufficientBalanceException) {
                        $started = null;
                    }
                    if (! $started) {
                        $this->cancelCountdown($table->refresh(), 'cannot_start');

                        return false;
                    }

                    return true;
                }
            }

            // Release the seats of players who have been gone too long (never during a countdown).
            if (! $table->countdown_ends_at) {
                $release = (int) config('pusoy.lobby.seat_release_seconds', 60);
                foreach ($players as $p) {
                    $seen = $p->last_seen_at ?? $p->created_at;
                    if (! $p->is_connected && $seen->lt($now->copy()->subSeconds($release))) {
                        $this->tables->leave($p->user, $table);
                    }
                }
            }

            return false;
        });

        if ($started) {
            AuditLogger::log(null, 'lobby.started', $table->room, null, ['table_id' => $table->id]);
        }
    }

    /** Run tick() for every lobby table that has not started yet (scheduler, every minute). */
    public function sweep(BankerMatchService $match): void
    {
        GameTable::query()->whereIn('status', [TableStatus::WaitingForPlayers->value, TableStatus::Ready->value])
            ->whereHas('room', fn ($q) => $q->whereNotNull('lobby_code'))
            ->get()
            ->each(fn (GameTable $t) => $this->tick($t, $match));
    }

    /** Stop the countdown and withdraw everyone's Start (they press it again when ready). */
    public function cancelCountdown(GameTable $table, string $reason, array $details = []): void
    {
        $table->forceFill(['countdown_ends_at' => null])->save();
        GamePlayer::query()->where('game_table_id', $table->id)->update(['is_ready' => false]);
        event(new TableEvent($table->id, GameEvents::COUNTDOWN_CANCELLED, ['reason' => $reason] + $details));
    }

    /**
     * Change your bet before the countdown (one of the lobby's bets; your Chips must cover 2× it).
     * Changing it withdraws your Start.
     */
    public function setBet(User $user, GameRoom $room, int $bet): GamePlayer
    {
        $this->assertLobby($room);

        return DB::transaction(function () use ($user, $room, $bet) {
            $table = $this->lockedOpenTable($room);
            $this->assertBeforeCountdown($table);
            $player = GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $user->id)->lockForUpdate()->first()
                ?? throw new BusinessRuleException('Join this lobby first.', 404, 'not_seated');

            $this->entry->assertCanPlay($user, $room, $bet);
            $player->forceFill(['selected_bet' => $bet, 'is_ready' => false, 'last_seen_at' => now(), 'is_connected' => true])->save();
            event(new TableEvent($table->id, GameEvents::PLAYER_UPDATED, ['user_id' => $user->id]));

            return $player;
        });
    }

    /**
     * The entry tiers for the Create Lobby screen.
     *
     * @return list<array{min_entry: int, bets: list<int>, keys: int}>
     */
    public function tierList(): array
    {
        $out = [];
        foreach (LobbyEntryService::tiers() as $entry => $tier) {
            $out[] = ['min_entry' => $entry, 'bets' => $tier['bets'], 'keys' => $tier['keys']];
        }

        return $out;
    }

    /** A seated player looking at the lobby is present (this is the waiting room's heartbeat). */
    private function touch(User $user, GameTable $table): void
    {
        $p = GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $user->id)->first();
        if (! $p) {
            return;
        }
        $wasGone = ! $p->is_connected;
        $p->forceFill(['last_seen_at' => now(), 'is_connected' => true])->save();
        if ($wasGone) {
            event(new TableEvent($table->id, GameEvents::PLAYER_RECONNECTED, ['user_id' => $user->id]));
        }
    }

    private function lockedOpenTable(GameRoom $room): GameTable
    {
        return GameTable::query()->where('game_room_id', $room->id)->where('status', '!=', TableStatus::Closed->value)->lockForUpdate()->first()
            ?? throw new BusinessRuleException('This lobby is closed.', 409, 'room_closed');
    }

    private function assertBeforeCountdown(GameTable $table): void
    {
        if ($table->status === TableStatus::InGame) {
            throw new BusinessRuleException('The game has already started.', 409, 'invalid_state');
        }
        if ($table->countdown_ends_at) {
            throw new BusinessRuleException('The countdown has started — seats are locked.', 409, 'countdown_running');
        }
    }

    /**
     * The owner changes the lobby before the game: name, password (set = private, empty = public)
     * and preparation time.
     *
     * @param  array{name?: string, password?: ?string, preparation_seconds?: int}  $data
     */
    public function update(User $user, GameRoom $room, array $data): GameRoom
    {
        $this->assertLobby($room);
        $this->assertOwnerBeforeStart($user, $room);

        $fill = [];
        if (isset($data['name'])) {
            $fill['name'] = trim($data['name']);
        }
        if (array_key_exists('password', $data)) {
            $pw = $data['password'] !== null && $data['password'] !== '' ? $data['password'] : null;
            $fill['lobby_password'] = $pw ? Hash::make($pw) : null;
            $fill['visibility'] = $pw ? RoomVisibility::Private : RoomVisibility::Public;
        }
        if (isset($data['preparation_seconds'])) {
            $fill['arrangement_seconds'] = (int) $data['preparation_seconds'];
        }

        $room->forceFill($fill)->save();
        event(new LobbyEvent($room->id, 'updated'));

        return $room;
    }

    /** The owner removes a player from the waiting room (before the game). */
    public function kick(User $user, GameRoom $room, int $userId): void
    {
        $this->assertLobby($room);
        $this->assertOwnerBeforeStart($user, $room);

        if ($userId === $user->id) {
            throw new BusinessRuleException('You cannot remove yourself — use Leave.', 422, 'invalid_target');
        }

        $table = $this->openTable($room) ?? throw new BusinessRuleException('This lobby is closed.', 409, 'room_closed');
        $target = User::query()->findOrFail($userId);
        if (! GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $userId)->exists()) {
            throw new BusinessRuleException('That player is not in this lobby.', 404, 'not_seated');
        }

        $this->tables->leave($target, $table);
        AuditLogger::log($user, 'lobby.player_removed', $room, null, ['user_id' => $userId]);
        $target->notify((new \App\Notifications\RemovedFromLobby($room, $user))->afterCommit());
    }

    // ------------------------------------------------------------------

    private function assertLobby(GameRoom $room): void
    {
        if (! $room->isLobby()) {
            throw new BusinessRuleException('Lobby not found.', 404, 'not_found');
        }
    }

    private function assertPlayer(User $user): void
    {
        if (! $user->isPlayer() || ! $user->isActive()) {
            throw new BusinessRuleException('Only active player accounts can play multiplayer.', 403, 'forbidden');
        }
    }

    private function assertOwnerBeforeStart(User $user, GameRoom $room): void
    {
        if ($room->owner_id !== $user->id) {
            throw new BusinessRuleException('Only the lobby owner can change this lobby.', 403, 'not_owner');
        }
        $table = $this->openTable($room);
        if ($table === null || $table->status === TableStatus::InGame || $table->countdown_ends_at) {
            throw new BusinessRuleException('The lobby can only be changed before the countdown starts.', 409, 'invalid_state');
        }
    }
}
