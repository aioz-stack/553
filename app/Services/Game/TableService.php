<?php

namespace App\Services\Game;

use App\Enums\Currency;
use App\Enums\HoldStatus;
use App\Enums\RoomStatus;
use App\Enums\RoomVisibility;
use App\Enums\TableStatus;
use App\Enums\TransactionType;
use App\Events\Game\GameEvents;
use App\Events\Game\TableEvent;
use App\Exceptions\BusinessRuleException;
use App\Models\GameInvitation;
use App\Models\GamePlayer;
use App\Models\GameRoom;
use App\Models\GameTable;
use App\Models\User;
use App\Models\WalletHold;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Support\Facades\DB;

/**
 * Seating lifecycle before a game starts: join, leave, ready, heartbeat.
 *
 * Concurrency: joining locks the user row (one seat per user at a time) and
 * the room row (serialises table selection/creation) before locking the
 * chosen table, so four simultaneous joins fill exactly one table and a
 * fifth player opens a new one.
 */
class TableService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
        private readonly GameEngine $engine,
        private readonly BankerMatchService $match,
    ) {}

    public function join(User $user, GameRoom $room, ?string $inviteCode = null): GamePlayer
    {
        $this->assertEligible($user, $room, $inviteCode);

        return DB::transaction(function () use ($user, $room) {
            User::query()->whereKey($user->id)->lockForUpdate()->first();

            $existing = $this->activeSeat($user);

            if ($existing) {
                if ($existing->table->game_room_id === $room->id) {
                    return $existing; // duplicate join is idempotent
                }

                throw new BusinessRuleException('You are already seated at another table.', 409, 'already_seated');
            }

            $room = GameRoom::query()->whereKey($room->id)->lockForUpdate()->firstOrFail();

            if ($room->game_mode->hasBanker()) {
                return $this->joinBankerTable($user, $room);
            }

            $table = GameTable::query()
                ->where('game_room_id', $room->id)
                ->where('status', TableStatus::WaitingForPlayers->value)
                ->withCount('players')
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->first(fn (GameTable $t) => $t->players_count < 4)
                ?? GameTable::create(['game_room_id' => $room->id, 'status' => TableStatus::WaitingForPlayers, 'seat_count' => 4]);

            // Locking read: sees seats committed by joins that held the room lock before us.
            $taken = GamePlayer::query()->where('game_table_id', $table->id)->lockForUpdate()->pluck('seat')->all();
            $seat = min(array_diff([1, 2, 3, 4], $taken));

            $wallet = $this->wallets->for($user, $room->currency);
            $previousHolds = WalletHold::query()->where('game_table_id', $table->id)->where('user_id', $user->id)->count();

            $entry = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::GameEntry,
                currency: $room->currency,
                source: $wallet,
                destination: $this->wallets->escrow($room->currency),
                amount: $room->entry_amount,
                reason: "Entry: {$room->name} (table #{$table->id})",
                actor: $user,
                idempotencyKey: "entry:{$table->id}:{$user->id}:{$previousHolds}",
                relatedPlayerId: $user->id,
                metadata: ['room_id' => $room->id, 'table_id' => $table->id],
            ));

            WalletHold::create([
                'wallet_id' => $wallet->id,
                'user_id' => $user->id,
                'game_table_id' => $table->id,
                'currency' => $room->currency,
                'amount' => $room->entry_amount,
                'status' => HoldStatus::Held,
                'entry_transaction_id' => $entry->id,
            ]);

            $player = GamePlayer::create([
                'game_table_id' => $table->id,
                'user_id' => $user->id,
                'seat' => $seat,
                'is_ready' => false,
                'is_connected' => true,
                'last_seen_at' => now(),
            ]);

            event(new TableEvent($table->id, GameEvents::PLAYER_JOINED, ['player' => $this->summary($player, $user)]));

            if (count($taken) + 1 === 4) {
                $table->forceFill(['status' => TableStatus::Ready, 'full_at' => now()])->save();
                event(new TableEvent($table->id, GameEvents::TABLE_FULL, ['ready_timeout_seconds' => config('pusoy.game.ready_timeout_seconds')]));
            }

            return $player->setRelation('table', $table);
        });
    }

    /**
     * Banker modes: no entry fee (money moves per bet). Join an open table or
     * a running match with a free seat and rounds left — new arrivals are
     * dealt in from the next round. The first player at a new table is its
     * creator (the banker in Banker Mode).
     */
    private function joinBankerTable(User $user, GameRoom $room): GamePlayer
    {
        $table = GameTable::query()
            ->where('game_room_id', $room->id)
            ->whereIn('status', [TableStatus::WaitingForPlayers->value, TableStatus::Ready->value, TableStatus::InGame->value])
            ->withCount('players')
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->first(fn (GameTable $t) => $t->players_count < 4 && $t->rounds_played < $t->rounds_total);

        if ($table === null) {
            if ($room->owner_id !== null && GameTable::query()->where('game_room_id', $room->id)->exists()) {
                throw new BusinessRuleException('This hosted table is full or finished.', 409, 'table_unavailable');
            }

            $table = GameTable::create([
                'game_room_id' => $room->id,
                'status' => TableStatus::WaitingForPlayers,
                'seat_count' => 4,
                'game_mode' => $room->game_mode,
                'rounds_total' => $room->rounds_total,
                'creator_user_id' => $user->id,
            ]);
        }

        $taken = GamePlayer::query()->where('game_table_id', $table->id)->lockForUpdate()->pluck('seat')->all();

        $player = GamePlayer::create([
            'game_table_id' => $table->id,
            'user_id' => $user->id,
            'seat' => min(array_diff([1, 2, 3, 4], $taken)),
            // Joining a running match means you are ready for the next round.
            'is_ready' => $table->status === TableStatus::InGame,
            'is_connected' => true,
            'last_seen_at' => now(),
        ]);

        event(new TableEvent($table->id, GameEvents::PLAYER_JOINED, ['player' => $this->summary($player, $user)]));

        if (count($taken) + 1 === 4) {
            event(new TableEvent($table->id, GameEvents::TABLE_FULL, ['ready_timeout_seconds' => config('pusoy.game.ready_timeout_seconds')]));
        }

        return $player->setRelation('table', $table);
    }

    public function leave(User $user, GameTable $table): void
    {
        DB::transaction(function () use ($user, $table) {
            $table = GameTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();

            if ($table->hasBanker()) {
                $player = GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $user->id)->first()
                    ?? throw new BusinessRuleException('You are not seated at this table.', 404, 'not_seated');

                if ($table->status === TableStatus::Closed) {
                    throw new BusinessRuleException('This match has ended.', 409, 'invalid_state');
                }

                $this->match->assertCanLeave($table, $user);
                $player->delete();
                event(new TableEvent($table->id, GameEvents::PLAYER_LEFT, ['user_id' => $user->id, 'reason' => 'left']));
                $this->match->afterLeave($table);

                return;
            }

            if (! in_array($table->status, [TableStatus::WaitingForPlayers, TableStatus::Ready], true)) {
                throw new BusinessRuleException('The game has started; you cannot leave now. Unsubmitted hands are auto-resolved when the timer ends.', 409, 'game_in_progress');
            }

            $player = GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $user->id)->first();

            if ($player === null) {
                throw new BusinessRuleException('You are not seated at this table.', 404, 'not_seated');
            }

            $this->unseat($table, $player, 'left');
        });
    }

    public function setReady(User $user, GameTable $table, bool $ready): GamePlayer
    {
        return DB::transaction(function () use ($user, $table, $ready) {
            $table = GameTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();

            if (! in_array($table->status, [TableStatus::WaitingForPlayers, TableStatus::Ready], true)) {
                throw new BusinessRuleException('Ready status can only change before the game starts.', 409, 'invalid_state');
            }

            $player = GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $user->id)->firstOrFail();
            $player->forceFill(['is_ready' => $ready, 'last_seen_at' => now(), 'is_connected' => true])->save();

            event(new TableEvent($table->id, GameEvents::PLAYER_READY, ['user_id' => $user->id, 'is_ready' => $ready]));

            if ($table->hasBanker()) {
                $this->match->maybeStart($table);

                return $player;
            }

            $players = GamePlayer::query()->where('game_table_id', $table->id)->get();

            if ($table->status === TableStatus::Ready && $players->count() === 4 && $players->every('is_ready')) {
                $this->engine->start($table);
            }

            return $player;
        });
    }

    /**
     * Client heartbeat (every ~10s). Restores a disconnected player.
     */
    public function heartbeat(User $user, GameTable $table): GamePlayer
    {
        $player = GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $user->id)->firstOrFail();
        $wasDisconnected = ! $player->is_connected;
        $player->forceFill(['last_seen_at' => now(), 'is_connected' => true])->save();

        if ($wasDisconnected) {
            event(new TableEvent($table->id, GameEvents::PLAYER_RECONNECTED, ['user_id' => $user->id]));
        }

        return $player;
    }

    /**
     * Close a table that has not started (admin action). Refunds everyone.
     */
    public function close(GameTable $table, string $reason): void
    {
        DB::transaction(function () use ($table, $reason) {
            $table = GameTable::query()->whereKey($table->id)->lockForUpdate()->firstOrFail();

            if (! in_array($table->status, [TableStatus::WaitingForPlayers, TableStatus::Ready], true)) {
                throw new BusinessRuleException('Only tables that have not started can be closed this way.', 409, 'invalid_state');
            }

            foreach (GamePlayer::query()->where('game_table_id', $table->id)->get() as $player) {
                $this->unseat($table, $player, $reason, recountStatus: false);
            }

            $table->forceFill(['status' => TableStatus::Closed, 'closed_at' => now()])->save();
            event(new TableEvent($table->id, GameEvents::GAME_CANCELLED, ['reason' => $reason]));
        });
    }

    public function activeSeat(User $user): ?GamePlayer
    {
        return GamePlayer::query()
            ->with('table')
            ->where('user_id', $user->id)
            ->whereHas('table', fn ($q) => $q->where('status', '!=', TableStatus::Closed->value))
            ->first();
    }

    /**
     * Housekeeping run by the scheduler (`pusoy:sweep`, every minute) and safe
     * to run at any time: disconnect detection and ready timeouts.
     */
    public function sweep(): void
    {
        $cutoff = now()->subSeconds((int) config('pusoy.game.disconnect_after_seconds'));

        GamePlayer::query()->where('is_connected', true)->where('last_seen_at', '<', $cutoff)
            ->whereHas('table', fn ($q) => $q->where('status', '!=', TableStatus::Closed->value))
            ->get()
            ->each(function (GamePlayer $player) {
                $player->forceFill(['is_connected' => false])->save();
                event(new TableEvent($player->game_table_id, GameEvents::PLAYER_DISCONNECTED, ['user_id' => $player->user_id]));
            });

        $readyCutoff = now()->subSeconds((int) config('pusoy.game.ready_timeout_seconds'));

        GameTable::query()->where('status', TableStatus::Ready->value)->where('full_at', '<', $readyCutoff)->get()
            ->each(function (GameTable $table) {
                DB::transaction(function () use ($table) {
                    $table = GameTable::query()->whereKey($table->id)->lockForUpdate()->first();

                    if ($table->status !== TableStatus::Ready) {
                        return;
                    }

                    foreach (GamePlayer::query()->where('game_table_id', $table->id)->where('is_ready', false)->get() as $player) {
                        $this->unseat($table, $player, 'ready_timeout');
                    }
                });
            });
    }

    private function unseat(GameTable $table, GamePlayer $player, string $reason, bool $recountStatus = true): void
    {
        $hold = WalletHold::query()->where('game_table_id', $table->id)->where('user_id', $player->user_id)
            ->where('status', HoldStatus::Held->value)->lockForUpdate()->first();

        if ($hold) {
            $refund = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::GameRefund,
                currency: $hold->currency,
                source: $this->wallets->escrow($hold->currency),
                destination: $hold->wallet,
                amount: $hold->amount,
                reason: "Refund ({$reason}) table #{$table->id}",
                idempotencyKey: "refund:hold:{$hold->id}",
                relatedPlayerId: $player->user_id,
            ));
            $hold->forceFill(['status' => HoldStatus::Released, 'release_transaction_id' => $refund->id])->save();
        }

        $player->delete();

        if ($recountStatus && $table->status === TableStatus::Ready) {
            $table->forceFill(['status' => TableStatus::WaitingForPlayers, 'full_at' => null])->save();
        }

        event(new TableEvent($table->id, GameEvents::PLAYER_LEFT, ['user_id' => $player->user_id, 'reason' => $reason]));
    }

    private function assertEligible(User $user, GameRoom $room, ?string $inviteCode): void
    {
        if (! $user->isPlayer() || ! $user->isActive()) {
            throw new BusinessRuleException('Only active player accounts can join game rooms.', 403, 'forbidden');
        }

        if ($room->status !== RoomStatus::Active) {
            throw new BusinessRuleException('This room is not open.', 409, 'room_closed');
        }

        if ($room->currency === Currency::CP && ! config('pusoy.features.cp_wagering')) {
            throw new BusinessRuleException('CP rooms are disabled pending regulatory approval.', 403, 'feature_disabled');
        }

        if ($room->visibility === RoomVisibility::Private
            && $room->owner_id !== $user->id
            && ! ($inviteCode && hash_equals((string) $room->invite_code, strtoupper($inviteCode)))
            && ! GameInvitation::query()->where('game_room_id', $room->id)->where('invitee_id', $user->id)->where('status', 'pending')->exists()) {
            throw new BusinessRuleException('This is a private room. You need an invitation.', 403, 'private_room');
        }

        $balance = $this->wallets->for($user, $room->currency)->balance;

        // Multiplayer lobbies: you must hold at least the lobby's Minimum Entry (nothing is deducted on entry).
        if ($room->min_entry !== null && $balance < $room->min_entry && ! $this->activeSeat($user)) {
            throw new BusinessRuleException('You need at least '.number_format(Points::decimal($room->min_entry)).' diamonds to enter this lobby.', 422, 'insufficient_balance');
        }
        // Banker modes: enough to cover the minimum bet's 2× reserve.
        $needed = $room->game_mode->hasBanker()
            ? $room->entry_amount * (int) config('pusoy.banker.reserve_multiplier', 2)
            : $room->entry_amount;

        if ($balance < $needed && ! $this->activeSeat($user)) {
            throw new BusinessRuleException($room->game_mode->hasBanker()
                ? 'You need at least '.Points::decimal($needed).' '.$room->currency->value.' to cover the minimum bet.'
                : 'Insufficient balance for this room entry.', 422, 'insufficient_balance');
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function summary(GamePlayer $player, ?User $user = null): array
    {
        $user ??= $player->user;

        return [
            'user_id' => $user->id,
            'name' => $user->profile?->display_name ?? $user->name,
            'username' => $user->username,
            'seat' => $player->seat,
            'is_ready' => $player->is_ready,
            'is_connected' => $player->is_connected,
        ];
    }
}
