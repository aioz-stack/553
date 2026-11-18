<?php

namespace App\Services\Game;

use App\Enums\Currency;
use App\Enums\GameMode;
use App\Enums\RoomStatus;
use App\Enums\RoomVisibility;
use App\Enums\TableStatus;
use App\Events\Game\GameEvents;
use App\Events\Game\LobbyEvent;
use App\Exceptions\BusinessRuleException;
use App\Models\GamePlayer;
use App\Models\GameRoom;
use App\Models\GameTable;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Multiplayer lobbies (the 553 Lobby): player-created, four-seat diamond (VC) rooms
 * on top of the existing rooms / tables / 12-round banker matches.
 *
 * - A lobby is a game_room with a public Lobby ID (`lobby_code`), an optional
 *   password (stored hashed; set = private lobby), a Minimum Entry (the diamond
 *   balance you must hold to enter — nothing is deducted on entry) and a
 *   Preparation Time (the arrangement timer). Game type: Banker Mode (the creator
 *   banks every round) or Round Bank (the creator banks first, then it rotates).
 * - Exactly four players: the owner presses Start once all four are seated and
 *   the others are ready (`owner_starts`; tables never start on their own).
 * - Money is the existing banker-match money: each round's bets are held in
 *   escrow from the players' VC wallets and settled by BankerMatchService, with
 *   idempotent ledger entries. The minimum bet is Minimum Entry ÷ 10, so a
 *   player holding the Minimum Entry can always cover a round (worst case as the
 *   banker against three players: 3 × 2 × bet = 6 × bet).
 * - Every change is broadcast as `lobby.updated` on the public `lobbies` channel.
 */
class LobbyService
{
    /** Minimum Entry choices, in diamonds. */
    public const MIN_ENTRIES = [100, 250, 500, 1000, 2000];

    /** Preparation Time choices (seconds to arrange the 13 cards). */
    public const PREPARATION_SECONDS = [30, 45, 60, 75];

    /** Minimum bet = Minimum Entry ÷ this. */
    public const ENTRY_TO_BET = 10;

    public const PER_PAGE = 5;

    /** Table events that change what the Lobby screen shows. */
    public const TABLE_EVENTS_THAT_CHANGE_LOBBIES = [
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
    ) {}

    // ------------------------------------------------------------------
    // Create
    // ------------------------------------------------------------------

    /**
     * @param  array{name: string, password?: ?string, game_mode: string, min_entry: int, preparation_seconds: int}  $data
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

            $minEntry = Points::toMinor((string) $data['min_entry']);
            if ($this->wallets->for($user, Currency::VC)->balance < $minEntry) {
                throw new BusinessRuleException('You need at least '.number_format($data['min_entry']).' diamonds to create this lobby.', 422, 'insufficient_balance');
            }

            $password = isset($data['password']) && $data['password'] !== '' ? $data['password'] : null;
            $mode = GameMode::from($data['game_mode']);

            $room = GameRoom::create([
                'name' => trim($data['name']),
                'slug' => Str::slug($data['name']).'-'.Str::lower(Str::random(6)),
                'description' => $mode->label().' lobby by '.$user->username,
                'currency' => Currency::VC,
                'entry_amount' => intdiv($minEntry, self::ENTRY_TO_BET),
                'payout_mode' => 'winner_takes_all',
                'game_mode' => $mode,
                'rounds_total' => (int) config('pusoy.banker.rounds', 12),
                'platform_fee_bps' => 0,
                'arrangement_seconds' => (int) $data['preparation_seconds'],
                'betting_seconds' => config('pusoy.banker.default_betting_seconds'),
                'min_players' => 4,
                'max_players' => 4,
                'tie_handling' => 'split_equally',
                'timeout_policy' => 'auto_arrange',
                'visibility' => $password ? RoomVisibility::Private : RoomVisibility::Public,
                'status' => RoomStatus::Active,
                'invite_code' => strtoupper(Str::random(8)),
                'lobby_code' => $this->newLobbyCode(),
                'lobby_password' => $password ? Hash::make($password) : null,
                'min_entry' => $minEntry,
                'owner_starts' => true,
                'owner_id' => $user->id,
                'created_by' => $user->id,
            ]);

            // The creator takes seat 1 and is the lobby owner (and the first banker in both modes).
            $this->tables->join($user, $room, $room->invite_code);

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
                'balance' => Points::decimal($this->wallets->for($user, Currency::VC)->balance),
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
            'min_bet' => Points::decimal($room->entry_amount),
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
    public function show(User $user, GameRoom $room): array
    {
        $this->assertLobby($room);
        $table = $this->openTable($room);
        $players = $table ? GamePlayer::query()->with('user.profile')->where('game_table_id', $table->id)->orderBy('seat')->get() : collect();
        $bankerId = $table?->banker_user_id ?? $table?->creator_user_id;

        $seats = [];
        foreach ([1, 2, 3, 4] as $seat) {
            $p = $players->firstWhere('seat', $seat);
            $seats[] = $p ? [
                'seat' => $seat,
                'user_id' => $p->user_id,
                'name' => $p->user->profile?->display_name ?? $p->user->name,
                'username' => $p->user->username,
                'is_ready' => (bool) $p->is_ready,
                'is_connected' => (bool) $p->is_connected,
                'is_owner' => $p->user_id === $room->owner_id,
                'is_banker' => $p->user_id === $bankerId,
                'is_you' => $p->user_id === $user->id,
            ] : ['seat' => $seat, 'user_id' => null];
        }

        $seated = $players->firstWhere('user_id', $user->id);
        $others = $players->where('user_id', '!=', $room->owner_id);

        return $this->summary($room, $seated ? $room->id : null) + [
            'table_id' => $table?->id,
            'table_status' => $table?->status->value,
            'seats' => $seats,
            'is_owner' => $room->owner_id === $user->id,
            'is_seated' => $seated !== null,
            'banker_rule' => $room->game_mode === GameMode::Banker ? 'The lobby owner banks every round.' : 'The lobby owner banks first; the banker then rotates clockwise each round.',
            'can_start' => $room->owner_id === $user->id && $table !== null && $table->status !== TableStatus::InGame
                && $players->count() === 4 && $others->every('is_ready'),
            'start_hint' => match (true) {
                $table === null => 'This lobby is closed.',
                $table->status === TableStatus::InGame => 'The game is in progress.',
                $players->count() < 4 => 'Waiting for '.(4 - $players->count()).' more player'.(4 - $players->count() === 1 ? '' : 's').'…',
                ! $others->every('is_ready') => 'Waiting for everyone to be ready…',
                default => $room->owner_id === $user->id ? 'Everyone is ready — start the game!' : 'Waiting for the owner to start…',
            },
        ];
    }

    // ------------------------------------------------------------------
    // Join / Quick Join
    // ------------------------------------------------------------------

    public function join(User $user, GameRoom $room, ?string $password = null): GamePlayer
    {
        $this->assertLobby($room);
        $this->assertPlayer($user);

        $seat = $this->tables->activeSeat($user);
        if ($seat && $seat->table->game_room_id === $room->id) {
            return $seat; // already here: joining again changes nothing
        }

        if ($room->isPrivateLobby() && ! Hash::check((string) $password, (string) $room->lobby_password)) {
            throw new BusinessRuleException($password ? 'Incorrect lobby password.' : 'This is a private lobby — enter its password.', 422, 'wrong_password');
        }

        if ($room->status !== RoomStatus::Active || $this->openTable($room) === null) {
            throw new BusinessRuleException('This lobby is closed.', 409, 'room_closed');
        }

        // TableService locks the player and the room, re-checks the seat count and the balance.
        return $this->tables->join($user, $room, $room->invite_code);
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

        $balance = $this->wallets->for($user, Currency::VC)->balance;
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
            try {
                return $this->tables->join($user, $room, $room->invite_code);
            } catch (BusinessRuleException $e) {
                if (in_array($e->errorCode(), ['table_unavailable', 'room_closed'], true)) {
                    continue; // filled up or closed a moment ago: try the next one
                }
                throw $e;
            }
        }

        throw new BusinessRuleException('No open lobby matches your diamonds right now — create one!', 404, 'no_lobby');
    }

    // ------------------------------------------------------------------
    // Owner actions
    // ------------------------------------------------------------------

    /** The owner starts the game: four players seated, the other three ready. */
    public function start(User $user, GameRoom $room, BankerMatchService $match): GameTable
    {
        $this->assertLobby($room);

        $table = DB::transaction(function () use ($user, $room, $match) {
            $table = GameTable::query()->where('game_room_id', $room->id)->where('status', '!=', TableStatus::Closed->value)->lockForUpdate()->first()
                ?? throw new BusinessRuleException('This lobby is closed.', 409, 'room_closed');
            $room->refresh();

            if ($room->owner_id !== $user->id) {
                throw new BusinessRuleException('Only the lobby owner can start the game.', 403, 'not_owner');
            }

            if ($table->status === TableStatus::InGame) {
                return $table; // already started (double tap)
            }

            $players = GamePlayer::query()->where('game_table_id', $table->id)->lockForUpdate()->get();
            if ($players->count() !== 4) {
                throw new BusinessRuleException('A game needs exactly four players.', 409, 'not_enough_players');
            }
            if (! $players->where('user_id', '!=', $user->id)->every('is_ready')) {
                throw new BusinessRuleException('Everyone must be ready first.', 409, 'not_ready');
            }

            // Pressing Start means the owner is ready too.
            GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $user->id)->update(['is_ready' => true]);

            if (! $match->maybeStart($table, byOwner: true)) {
                throw new BusinessRuleException('The game could not start — every player needs enough diamonds for the minimum bet.', 409, 'cannot_start');
            }

            return $table->refresh();
        });

        AuditLogger::log($user, 'lobby.started', $room, null, ['table_id' => $table->id]);

        return $table;
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
        if ($table === null || $table->status === TableStatus::InGame) {
            throw new BusinessRuleException('The lobby can only be changed before the game starts.', 409, 'invalid_state');
        }
    }
}
