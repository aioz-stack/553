<?php

use App\Enums\Currency;
use App\Enums\WalletType;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Models\User;
use App\Services\Game\TableService;
use App\Game\AutoArranger;
use App\Models\GameBet;
use App\Models\GameCard;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use App\Enums\TransactionType;
use App\Services\Wallet\AllocationService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

/** A Super Admin with a float of 1,000,000 Chips issued into their own wallet (loads draw on it). */
function superAdmin(): User
{
    $user = User::factory()->superAdmin()->create();
    app(AllocationService::class)->issue($user, 1_000_000_00, 'test float');

    return $user;
}

/**
 * Credit a wallet the real way: Chips are issued to a Super Admin and loaded through the
 * allocation workflow (Load Logs and all); Gold (Single Player only, never loaded) is
 * credited straight through the ledger.
 */
function fund(User $user, int $minor, Currency $currency = Currency::CH): void
{
    if ($currency === Currency::GD) {
        $wallets = app(WalletService::class);
        app(LedgerService::class)->transfer(new TransferRequest(TransactionType::ManualAdjustment, Currency::GD, null, $wallets->for($user, Currency::GD), $minor, 'test funding'));

        return;
    }

    $issuer = User::query()->where('role', 'super_admin')->where('username', 'test-issuer')->first()
        ?? User::factory()->superAdmin()->create(['username' => 'test-issuer']);

    $allocations = app(AllocationService::class);
    $allocations->issue($issuer, $minor, 'test issuance');
    $allocations->allocate($issuer, $user, $currency, $minor, 'test funding');
}

function balance(User $user, Currency $currency = Currency::CH, WalletType $type = WalletType::Player): int
{
    return app(WalletService::class)->for($user, $currency, $type)->fresh()->balance;
}

/**
 * Seat four funded players at a fresh table in the room and ready them,
 * which starts the game.
 *
 * @return array{0: GameTable, 1: ?GameSession, 2: list<User>}
 */
function startGame(?GameRoom $room = null, bool $ready = true): array
{
    $room ??= GameRoom::factory()->create();
    $tables = app(TableService::class);
    $players = [];

    foreach (range(1, 4) as $i) {
        $player = User::factory()->player()->create();
        fund($player, $room->entry_amount * 3, $room->currency);
        $players[] = $player;
        $seat = $tables->join($player, $room);
    }

    $table = $seat->table->fresh();

    if ($ready) {
        foreach ($players as $player) {
            $tables->setReady($player, $table, true);
        }
    }

    $table->refresh();

    return [$table, $table->currentSession, $players];
}

// ---------------------------------------------------------------------------
// Multiplayer lobby helpers (LobbyTest, MultiplayerMatchTest)
// ---------------------------------------------------------------------------

/** A player holding `$diamonds` VC. */
function lbPlayer(int $diamonds = 10_000, int $keys = 50): User
{
    $u = User::factory()->player()->create();
    fund($u, $diamonds * 100);
    // Lobbies charge a Keys entry fee when the game starts (1 / 2 / 5 Keys per tier).
    if ($keys > 0) {
        fundKeys($u, $keys);
    }

    return $u;
}

function fundKeys(User $u, int $keys): void
{
    $wallets = app(\App\Services\Wallet\WalletService::class);
    app(\App\Services\Wallet\LedgerService::class)->transfer(new \App\Services\Wallet\TransferRequest(\App\Enums\TransactionType::ManualAdjustment, \App\Enums\Currency::KY, null, $wallets->for($u, \App\Enums\Currency::KY), $keys * 100, 'test keys'));
}

function lbPlayerOnly(int $diamonds = 10_000): User
{
    $u = User::factory()->player()->create();
    fund($u, $diamonds * 100);

    return $u;
}

function lbCreate($test, User $u, array $over = [])
{
    return $test->actingAs($u, 'sanctum')->postJson('/api/v1/lobbies', $over + [
        'name' => 'Rookie Room',
        'game_mode' => 'round_bank',
        'min_entry' => 1000,
        'preparation_seconds' => 45,
    ]);
}

/** Owner + three joined players, everyone's seat (1–4 in join order) confirmed. */
function lbFull($test, array $over = []): array
{
    $owner = lbPlayer();
    $room = lbCreate($test, $owner, $over)->assertCreated()->json('data');
    $test->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 1])->assertOk();
    $others = [];
    foreach (range(1, 3) as $i) {
        $p = lbPlayer();
        $test->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join", ['password' => $over['password'] ?? null])->assertCreated();
        $test->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => $i + 1])->assertOk();
        $others[] = $p;
    }

    return [$owner, $room, $others];
}

/** All four press Start; after the 3-second countdown the next look at the lobby starts the match. */
function lbStart($test, array $players, array $room): GameTable
{
    foreach ($players as $p) {
        $test->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    }
    $test->travel(3100)->milliseconds();
    $test->actingAs($players[0], 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk();

    return GameTable::query()->findOrFail($room['table_id']);
}

function lbPlayRound(GameTable $table): GameSession
{
    $session = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    foreach ($session->config['participants'] as $userId) {
        if (! GameBet::query()->where('game_session_id', $session->id)->where('user_id', $userId)->exists()) {
            app(BankerMatchService::class)->placeBet(User::find($userId), $session, $session->config['min_bet']);
        }
    }
    foreach (GameCard::query()->where('game_session_id', $session->id)->get() as $card) {
        if (! $session->submissions()->where('user_id', $card->user_id)->exists()) {
            $a = AutoArranger::arrange($card->cards);
            app(GameEngine::class)->submit(User::find($card->user_id), $session->fresh(), $a->front, $a->middle, $a->back);
        }
    }

    return $session->fresh();
}
