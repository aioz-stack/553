<?php

use App\Enums\Currency;
use App\Models\GameCard;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

// A Multiplayer match starts with at least 2 players (LobbyService::MIN_PLAYERS); the table seats 4.

/** A lobby with the owner plus $guests more players, every seat confirmed: [owner, room, guests]. */
function mpLobby($test, int $guests): array
{
    $owner = lbPlayer();
    $room = lbCreate($test, $owner, ['min_entry' => 100])->assertCreated()->json('data');
    $test->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 1])->assertOk();
    $list = [];
    for ($i = 0; $i < $guests; $i++) {
        $p = lbPlayer();
        $test->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join")->assertCreated();
        $test->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => $i + 2])->assertOk();
        $list[] = $p;
    }

    return [$owner, $room, $list];
}

test('alone in the lobby: Start is unavailable and refused with the message', function () {
    [$owner, $room] = mpLobby($this, 0);
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk()
        ->assertJsonPath('data.can_press_start', false)
        ->assertJsonPath('data.seated_count', 1)->assertJsonPath('data.min_players', 2)
        ->assertJsonPath('data.start_hint', 'At least 2 players are required to start the game.');
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertStatus(409)
        ->assertJsonPath('error', 'not_enough_players')->assertJsonPath('message', 'At least 2 players are required to start the game.');
});

test('two players start a match: 2/4 seats, cards dealt to the two only, Keys charged to the two', function () {
    [$owner, $room, [$guest]] = mpLobby($this, 1);
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertJsonPath('data.can_press_start', true)->assertJsonPath('data.seated_count', 2);
    $keys = fn ($u) => (int) app(WalletService::class)->for($u, Currency::KY)->fresh()->balance;
    $before = [$keys($owner), $keys($guest)];

    $table = lbStart($this, [$owner, $guest], $room);
    expect($table->fresh()->status->value)->toBe('IN_GAME');
    $session = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    expect($session->banker_user_id)->toBeIn([$owner->id, $guest->id])
        ->and($session->config['participants'])->toHaveCount(1);

    // Entry Keys (100-tier: 1 Key) from the two players only.
    expect($keys($owner))->toBe($before[0] - 100)->and($keys($guest))->toBe($before[1] - 100);

    // The player bets; the round is dealt to exactly the two seated players.
    $player = $session->config['participants'][0];
    app(\App\Services\Game\BankerMatchService::class)->placeBet(\App\Models\User::find($player), $session, $session->config['min_bet']);
    $session->refresh();
    expect($session->status->value)->toBe('ARRANGING');
    $cards = GameCard::query()->where('game_session_id', $session->id)->get();
    expect($cards)->toHaveCount(2)
        ->and($cards->flatMap(fn ($c) => $c->cards)->unique()->count())->toBe(26)
        ->and($cards->pluck('user_id')->sort()->values()->all())->toBe(collect([$owner->id, $guest->id])->sort()->values()->all());
});

test('three players start too; the countdown needs everyone seated to press Start', function () {
    [$owner, $room, [$a, $b]] = mpLobby($this, 2);
    foreach ([$owner, $a] as $p) {
        $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    }
    expect(GameTable::query()->find($room['table_id'])->countdown_ends_at)->toBeNull(); // $b has not pressed Start
    $table = lbStart($this, [$owner, $a, $b], $room);
    expect($table->fresh()->status->value)->toBe('IN_GAME');
});

test('during the countdown nobody new joins; a player leaving (fewer than 2) stops the start', function () {
    [$owner, $room, [$guest]] = mpLobby($this, 1);
    foreach ([$owner, $guest] as $p) {
        $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    }
    $table = GameTable::query()->find($room['table_id']);
    expect($table->countdown_ends_at)->not->toBeNull();

    $late = lbPlayer();
    $this->actingAs($late, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join")->assertStatus(409)->assertJsonPath('error', 'countdown_running');

    // The guest leaves: one player left — no match starts, even after the countdown time.
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertOk();
    $this->travel(3100)->milliseconds();
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk()
        ->assertJsonPath('data.start_hint', 'At least 2 players are required to start the game.');
    expect($table->fresh()->status->value)->not->toBe('IN_GAME')->and($table->fresh()->countdown_ends_at)->toBeNull();
});

test('a repeated Start (double tap) starts one match only', function () {
    [$owner, $room, [$guest]] = mpLobby($this, 1);
    $table = lbStart($this, [$owner, $guest], $room);
    $first = $table->fresh()->current_session_id;
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk();
    expect($table->fresh()->current_session_id)->toBe($first)
        ->and(GameSession::query()->where('game_table_id', $table->id)->count())->toBe(1);
});

test('a two-player match plays whole rounds: scored, settled, and the bank rotates to the other player', function () {
    [$owner, $room, [$guest]] = mpLobby($this, 1);
    $table = lbStart($this, [$owner, $guest], $room);
    $wallets = app(WalletService::class);

    $first = lbPlayRound($table);
    expect($first->status->value)->toBe('COMPLETED')
        ->and(\App\Models\GameResult::query()->where('game_session_id', $first->id)->count())->toBe(2)
        ->and(\App\Models\GameResult::query()->where('game_session_id', $first->id)->pluck('user_id')->sort()->values()->all())
        ->toBe(collect([$owner->id, $guest->id])->sort()->values()->all())
        ->and($wallets->escrow(Currency::CH)->fresh()->balance)->toBe(0);

    // Round 2 starts with the same two players (nobody else needed) and the other one banks.
    $this->travel(10)->seconds();
    $second = app(\App\Services\Game\BankerMatchService::class)->startRound($table->fresh());
    expect($second)->not->toBeNull()
        ->and($second->round_number)->toBe(2)
        ->and($second->banker_user_id)->not->toBe($first->banker_user_id)
        ->and($second->banker_user_id)->toBeIn([$owner->id, $guest->id]);

    $second = lbPlayRound($table);
    expect($second->status->value)->toBe('COMPLETED')
        ->and($wallets->escrow(Currency::CH)->fresh()->balance)->toBe(0)
        ->and($wallets->reconcile()['ok'])->toBeTrue();
});

test('two confirmed seats are enough: a player still choosing a seat does not block the start and is released when it begins', function () {
    [$owner, $room, [$guest]] = mpLobby($this, 1);
    $late = lbPlayer();
    $this->actingAs($late, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join")->assertCreated(); // joined, seat not confirmed

    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk()
        ->assertJsonPath('data.seated_count', 3)->assertJsonPath('data.confirmed_count', 2)
        ->assertJsonPath('data.all_confirmed', true)->assertJsonPath('data.can_press_start', true);
    // The unconfirmed player still sees Choose Your Seat and cannot press Start.
    $this->actingAs($late, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk()
        ->assertJsonPath('data.all_confirmed', false)->assertJsonPath('data.can_press_start', false);
    $this->actingAs($late, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertStatus(409)->assertJsonPath('error', 'seat_not_confirmed');

    $keys = fn ($u) => (int) app(WalletService::class)->for($u, Currency::KY)->fresh()->balance;
    $lateKeys = $keys($late);

    $table = lbStart($this, [$owner, $guest], $room);
    expect($table->fresh()->status->value)->toBe('IN_GAME')
        ->and(\App\Models\GamePlayer::query()->where('game_table_id', $table->id)->pluck('user_id')->sort()->values()->all())
        ->toBe(collect([$owner->id, $guest->id])->sort()->values()->all())
        ->and($keys($late))->toBe($lateKeys)
        ->and($late->notifications()->where('type', \App\Notifications\RemovedFromLobby::class)->count())->toBe(1);
});

test('one confirmed seat plus an unconfirmed player is still not enough to start', function () {
    [$owner, $room] = mpLobby($this, 0);
    $late = lbPlayer();
    $this->actingAs($late, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join")->assertCreated();
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk()
        ->assertJsonPath('data.can_press_start', false)->assertJsonPath('data.seated_count', 2)->assertJsonPath('data.confirmed_count', 1);
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertStatus(409)->assertJsonPath('error', 'not_enough_players');
});
