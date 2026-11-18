<?php

use App\Enums\GameMode;
use App\Enums\TableStatus;
use App\Events\Game\LobbyEvent;
use App\Game\AutoArranger;
use App\Models\GameBet;
use App\Models\GameCard;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Models\User;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
});

/** A player holding `$diamonds` VC. */
function lbPlayer(int $diamonds = 10_000): User
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

test('create a public lobby: unique 6-digit ID, owner in seat 1, settings stored, listed', function () {
    Event::fake([LobbyEvent::class]);
    $owner = lbPlayer();
    $res = lbCreate($this, $owner)->assertCreated()
        ->assertJsonPath('data.type', 'public')
        ->assertJsonPath('data.game_mode', 'round_bank')
        ->assertJsonPath('data.min_entry', 1000)
        ->assertJsonPath('data.min_bet', '100.00')
        ->assertJsonPath('data.preparation_seconds', 45)
        ->assertJsonPath('data.players', 1)
        ->assertJsonPath('data.status', 'waiting')
        ->assertJsonPath('data.is_owner', true)
        ->assertJsonPath('data.seats.0.is_you', true)
        ->assertJsonPath('data.seats.0.is_owner', true)
        ->assertJsonPath('data.seats.0.is_banker', true);
    expect($res->json('data.lobby_id'))->toMatch('/^\d{6}$/');
    Event::assertDispatched(LobbyEvent::class);

    $room = GameRoom::query()->findOrFail($res->json('data.id'));
    expect($room->owner_starts)->toBeTrue()->and($room->min_players)->toBe(4)->and($room->lobby_password)->toBeNull();

    // A second lobby gets a different ID; you cannot create one while seated.
    lbCreate($this, $owner)->assertStatus(409)->assertJsonPath('error', 'already_seated');
    $other = lbCreate($this, lbPlayer())->assertCreated()->json('data.lobby_id');
    expect($other)->not->toBe($res->json('data.lobby_id'));

    $list = $this->actingAs(lbPlayer(), 'sanctum')->getJson('/api/v1/lobbies')->assertOk();
    expect($list->json('meta.counts'))->toBe(['all' => 2, 'public' => 2, 'private' => 0]);
});

test('create validation: name required and ≤ 30, valid mode / entry / preparation time, enough diamonds', function () {
    $u = lbPlayer(5_000);
    lbCreate($this, $u, ['name' => ''])->assertStatus(422)->assertJsonValidationErrors('name');
    lbCreate($this, $u, ['name' => str_repeat('x', 31)])->assertStatus(422)->assertJsonValidationErrors('name');
    lbCreate($this, $u, ['game_mode' => 'classic'])->assertStatus(422)->assertJsonValidationErrors('game_mode');
    lbCreate($this, $u, ['min_entry' => 300])->assertStatus(422)->assertJsonValidationErrors('min_entry');
    lbCreate($this, $u, ['preparation_seconds' => 90])->assertStatus(422)->assertJsonValidationErrors('preparation_seconds');
    lbCreate($this, lbPlayer(500), ['min_entry' => 1000])->assertStatus(422)->assertJsonPath('error', 'insufficient_balance');
    expect(GameRoom::query()->lobby()->count())->toBe(0);
});

test('private lobby: password hashed and never returned; wrong password rejected, right one joins', function () {
    $owner = lbPlayer();
    $id = lbCreate($this, $owner, ['password' => 'tiger553'])->assertCreated()->assertJsonPath('data.type', 'private')->json('data.id');
    $room = GameRoom::query()->findOrFail($id);
    expect($room->lobby_password)->not->toBe('tiger553')->and(password_verify('tiger553', $room->lobby_password))->toBeTrue();

    $guest = lbPlayer();
    $this->actingAs($guest, 'sanctum')->getJson('/api/v1/lobbies?tab=private')->assertOk()
        ->assertJsonPath('meta.counts.private', 1)->assertJsonMissingPath('data.0.lobby_password');
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$id}/join")->assertStatus(422)->assertJsonPath('error', 'wrong_password');
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['password' => 'nope'])->assertStatus(422)->assertJsonPath('message', 'Incorrect lobby password.');
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['password' => 'tiger553'])->assertCreated()->assertJsonPath('data.players', 2);
    // Joining again is harmless.
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['password' => 'tiger553'])->assertCreated()->assertJsonPath('data.players', 2);
});

test('joining needs the Minimum Entry balance; a full lobby rejects a fifth player', function () {
    $owner = lbPlayer();
    $id = lbCreate($this, $owner, ['min_entry' => 2000])->json('data.id');

    $this->actingAs(lbPlayer(1_999), 'sanctum')->postJson("/api/v1/lobbies/{$id}/join")->assertStatus(422)->assertJsonPath('error', 'insufficient_balance');

    foreach (range(1, 3) as $i) {
        $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$id}/join")->assertCreated();
    }
    $this->actingAs(lbPlayer(), 'sanctum')->getJson('/api/v1/lobbies')->assertJsonPath('data.0.status', 'full')->assertJsonPath('data.0.can_join', false);
    $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$id}/join")->assertStatus(409);
    expect(GameTable::query()->where('game_room_id', $id)->first()->players()->count())->toBe(4);
});

test('quick join: picks an affordable public lobby with free seats (fullest first), never private ones', function () {
    $rich = lbPlayer(10_000);
    $a = lbCreate($this, $rich, ['name' => 'Low', 'min_entry' => 100])->json('data.id');
    $b = lbCreate($this, lbPlayer(10_000), ['name' => 'High', 'min_entry' => 2000])->json('data.id');
    lbCreate($this, lbPlayer(10_000), ['name' => 'Secret', 'min_entry' => 100, 'password' => 'abcd1234']);
    $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$b}/join")->assertCreated();
    $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$b}/join")->assertCreated(); // High now has 3

    // 1,000 diamonds: only "Low" is affordable.
    $this->actingAs($p1 = lbPlayer(1_000), 'sanctum')->postJson('/api/v1/lobbies/quick-join')->assertCreated()->assertJsonPath('data.id', $a);
    // 10,000: both affordable; "High" has more players, so it goes first.
    $this->actingAs(lbPlayer(10_000), 'sanctum')->postJson('/api/v1/lobbies/quick-join')->assertCreated()->assertJsonPath('data.id', $b);
    // Already seated: no second room.
    $this->actingAs($p1, 'sanctum')->postJson('/api/v1/lobbies/quick-join')->assertStatus(409)->assertJsonPath('error', 'already_seated');
    // Too poor for any: friendly message.
    $this->actingAs(lbPlayer(50), 'sanctum')->postJson('/api/v1/lobbies/quick-join')->assertStatus(404)->assertJsonPath('error', 'no_lobby');
});

test('choose your seat: one seat per player, no two players on one seat, reserved until confirmed', function () {
    $owner = lbPlayer();
    $room = lbCreate($this, $owner)->assertCreated()->json('data');
    // You arrive holding a seat (reserved) and choose / confirm one.
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")
        ->assertJsonPath('data.seats.0.state', 'reserved')->assertJsonPath('data.my_seat', 1)->assertJsonPath('data.my_seat_confirmed', false)
        ->assertJsonPath('data.seats.1.state', 'available');
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 3])->assertOk()
        ->assertJsonPath('data.my_seat', 3)->assertJsonPath('data.seats.2.state', 'occupied')->assertJsonPath('data.seats.0.state', 'available');

    $guest = lbPlayer();
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join")->assertCreated()->assertJsonPath('data.my_seat', 1);
    // The owner's seat is taken; the guest's own reserved seat cannot be taken by the owner either.
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 3])->assertStatus(409)->assertJsonPath('error', 'seat_taken');
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 1])->assertStatus(409)->assertJsonPath('error', 'seat_taken');
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 4])->assertOk();
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 9])->assertStatus(422);
    // Not in the lobby: no seat.
    $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 2])->assertStatus(404)->assertJsonPath('error', 'not_seated');

    $seats = GameTable::query()->find($room['table_id'])->players()->pluck('seat', 'user_id')->all();
    expect($seats)->toBe([$owner->id => 3, $guest->id => 4]);
    // Start stays unavailable until all four have confirmed.
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertJsonPath('data.can_press_start', false)->assertJsonPath('data.all_confirmed', false);
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertStatus(409)->assertJsonPath('error', 'seats_not_confirmed');
    // Lobby tables cannot be readied the old way.
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/tables/{$room['table_id']}/ready", ['ready' => true])->assertStatus(409)->assertJsonPath('error', 'use_lobby_start');
});

test('all four press Start → synchronized server countdown → the match starts; nothing is deducted on entry', function () {
    [$owner, $room, $others] = lbFull($this);
    $show = fn ($u) => $this->actingAs($u, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk();
    $show($owner)->assertJsonPath('data.all_confirmed', true)->assertJsonPath('data.can_press_start', true)->assertJsonPath('data.countdown_ends_at', null);

    foreach ([$owner, $others[0], $others[1]] as $p) {
        $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    }
    $show($owner)->assertJsonPath('data.ready_count', 3)->assertJsonPath('data.countdown_ends_at', null)->assertJsonPath('data.seats.3.is_ready', false);
    expect(balance($others[0]))->toBe(10_000 * 100);

    // The fourth press starts the countdown; everyone gets the same end time from the server.
    $this->actingAs($others[2], 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    $endsAt = $show($others[0])->json('data.countdown_ends_at');
    expect($endsAt)->not->toBeNull()->and($show($others[1])->json('data.countdown_ends_at'))->toBe($endsAt);
    // Seats are locked during the countdown; the match has not started yet.
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 1])->assertStatus(409)->assertJsonPath('error', 'countdown_running');
    expect(GameTable::query()->find($room['table_id'])->status)->not->toBe(TableStatus::InGame);

    $this->travel(3100)->milliseconds();
    $show($owner)->assertJsonPath('data.table_status', 'IN_GAME')->assertJsonPath('data.countdown_ends_at', null);
    // A late tap changes nothing.
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();

    $table = GameTable::query()->find($room['table_id']);
    $session = GameSession::query()->find($table->current_session_id);
    expect($table->status)->toBe(TableStatus::InGame)->and($session->banker_user_id)->toBe($owner->id)
        ->and($session->config['arrangement_seconds'])->toBe(45)->and($session->config['min_bet'])->toBe(10_000);
    // Seats are kept for the match.
    expect($table->players()->pluck('seat', 'user_id')->all())->toBe([$owner->id => 1, $others[0]->id => 2, $others[1]->id => 3, $others[2]->id => 4]);
    $this->actingAs(lbPlayer(), 'sanctum')->getJson('/api/v1/lobbies')->assertJsonPath('data.0.status', 'in_game');
});

test('the countdown is cancelled (and every Start reset) when a player withdraws, leaves or drops out', function () {
    [$owner, $room, $others] = lbFull($this);
    $all = [$owner, ...$others];
    $pressAll = fn () => collect($all)->each(fn ($p) => $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk());
    $table = fn () => GameTable::query()->find($room['table_id']);

    // Withdraw.
    $pressAll();
    expect($table()->countdown_ends_at)->not->toBeNull();
    $this->actingAs($others[1], 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start", ['ready' => false])->assertOk()
        ->assertJsonPath('data.countdown_ends_at', null)->assertJsonPath('data.ready_count', 0);

    // Drop out: one player stops checking in; the server cancels instead of starting.
    $pressAll();
    $this->travel(7)->seconds();
    foreach ([$owner, $others[0], $others[1]] as $p) {
        $this->actingAs($p, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk();
    }
    expect($table()->status)->not->toBe(TableStatus::InGame)->and($table()->countdown_ends_at)->toBeNull()
        ->and($table()->players()->where('is_ready', true)->count())->toBe(0);

    // Leave during the countdown.
    $this->actingAs($others[2], 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk(); // back online
    $pressAll();
    $this->actingAs($others[2], 'sanctum')->postJson("/api/v1/tables/{$room['table_id']}/leave")->assertOk();
    expect($table()->countdown_ends_at)->toBeNull()->and($table()->players()->count())->toBe(3);
});

test('a player gone longer than the seat timeout loses the seat before the match', function () {
    config(['pusoy.lobby.seat_release_seconds' => 60]);
    [$owner, $room, $others] = lbFull($this);
    $this->travel(30)->seconds();
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertJsonPath('data.seats.1.is_connected', false)->assertJsonPath('data.players', 4);
    $this->travel(40)->seconds();
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertJsonPath('data.players', 1)->assertJsonPath('data.seats.1.state', 'available');
});

test('round bank: the creator banks first, then the banker rotates clockwise; banker mode keeps the creator', function () {
    [$owner, $room, $others] = lbFull($this, ['game_mode' => 'round_bank']);
    $table = lbStart($this, [$owner, ...$others], $room);
    $seatOrder = [$owner->id, $others[0]->id, $others[1]->id, $others[2]->id];

    $bankers = [];
    for ($r = 1; $r <= 4; $r++) {
        $bankers[] = GameSession::query()->find($table->fresh()->current_session_id)->banker_user_id;
        lbPlayRound($table);
        $this->travel(10)->seconds();
        app(BankerMatchService::class)->startRound($table->fresh());
    }
    expect($bankers)->toBe($seatOrder);

    [$owner2, $room2, $others2] = lbFull($this, ['game_mode' => 'banker', 'name' => 'Bank']);
    $t2 = lbStart($this, [$owner2, ...$others2], $room2);
    lbPlayRound($t2);
    $this->travel(10)->seconds();
    app(BankerMatchService::class)->startRound($t2->fresh());
    expect(GameSession::query()->find($t2->fresh()->current_session_id)->banker_user_id)->toBe($owner2->id);
});

test('owner leaving passes ownership on; the last player leaving closes the lobby; owner can kick and edit', function () {
    $owner = lbPlayer();
    $room = lbCreate($this, $owner)->json('data');
    $guest = lbPlayer();
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join")->assertCreated();

    // Only the owner edits / kicks.
    $this->actingAs($guest, 'sanctum')->patchJson("/api/v1/lobbies/{$room['id']}", ['name' => 'Mine now'])->assertStatus(403);
    $this->actingAs($owner, 'sanctum')->patchJson("/api/v1/lobbies/{$room['id']}", ['name' => 'Renamed', 'password' => 'lock1234', 'preparation_seconds' => 75])->assertOk()
        ->assertJsonPath('data.name', 'Renamed')->assertJsonPath('data.type', 'private')->assertJsonPath('data.preparation_seconds', 75);
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/kick", ['user_id' => $guest->id])->assertOk()->assertJsonPath('data.players', 1);
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join", ['password' => 'lock1234'])->assertCreated();

    // Owner leaves: the guest becomes owner (and banker).
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/tables/{$room['table_id']}/leave")->assertOk();
    $this->actingAs($guest, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertJsonPath('data.is_owner', true)->assertJsonPath('data.seats.1.is_banker', true);

    // Last player leaves: the lobby closes and leaves the list.
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/tables/{$room['table_id']}/leave")->assertOk();
    $this->actingAs(lbPlayer(), 'sanctum')->getJson('/api/v1/lobbies')->assertJsonPath('meta.counts.all', 0);
    $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join", ['password' => 'lock1234'])->assertStatus(409);
});

test('list: tabs, search by name or Lobby ID, 5 per page', function () {
    foreach (range(1, 7) as $i) {
        lbCreate($this, lbPlayer(), ['name' => "Table {$i}"] + ($i % 3 === 0 ? ['password' => 'pass1234'] : []))->assertCreated();
    }
    $viewer = lbPlayer();
    $this->actingAs($viewer, 'sanctum')->getJson('/api/v1/lobbies')->assertOk()
        ->assertJsonCount(5, 'data')->assertJsonPath('meta.pages', 2)->assertJsonPath('meta.counts', ['all' => 7, 'public' => 5, 'private' => 2]);
    $this->actingAs($viewer, 'sanctum')->getJson('/api/v1/lobbies?page=2')->assertJsonCount(2, 'data')->assertJsonPath('meta.page', 2);
    $this->actingAs($viewer, 'sanctum')->getJson('/api/v1/lobbies?tab=private')->assertJsonCount(2, 'data')->assertJsonPath('data.0.type', 'private');
    $this->actingAs($viewer, 'sanctum')->getJson('/api/v1/lobbies?search=Table 4')->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Table 4');
    $code = GameRoom::query()->where('name', 'Table 2')->value('lobby_code');
    $this->actingAs($viewer, 'sanctum')->getJson("/api/v1/lobbies?search={$code}")->assertJsonPath('data.0.name', 'Table 2');
    $this->actingAs($viewer, 'sanctum')->getJson('/api/v1/lobbies?page=9')->assertJsonPath('meta.page', 2);
});

test('lobbies are for players only; guests are rejected', function () {
    $this->getJson('/api/v1/lobbies')->assertUnauthorized();
    $agent = User::factory()->create(['role' => 'agent']);
    fund($agent, 1_000_000);
    lbCreate($this, $agent)->assertStatus(403);
});

test('the Game Type shown in the list and in the lobby details is the mode the creator chose', function () {
    $rb = lbCreate($this, lbPlayer(), ['name' => 'RB Room', 'game_mode' => 'round_bank'])->assertCreated()
        ->assertJsonPath('data.game_mode', 'round_bank')->assertJsonPath('data.game_mode_label', 'Round Bank')->json('data.id');
    $bm = lbCreate($this, lbPlayer(), ['name' => 'BM Room', 'game_mode' => 'banker'])->assertCreated()
        ->assertJsonPath('data.game_mode', 'banker')->assertJsonPath('data.game_mode_label', 'Banker Mode')->json('data.id');

    $viewer = lbPlayer();
    $list = collect($this->actingAs($viewer, 'sanctum')->getJson('/api/v1/lobbies')->assertOk()->json('data'))->keyBy('id');
    expect($list[$rb]['game_mode_label'])->toBe('Round Bank')->and($list[$bm]['game_mode_label'])->toBe('Banker Mode');
    $this->actingAs($viewer, 'sanctum')->getJson("/api/v1/lobbies/{$rb}")->assertJsonPath('data.game_mode_label', 'Round Bank');
    $this->actingAs($viewer, 'sanctum')->getJson("/api/v1/lobbies/{$bm}")->assertJsonPath('data.game_mode_label', 'Banker Mode');
});
