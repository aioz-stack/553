<?php

use App\Game\AutoArranger;
use App\Game\Deck;
use App\Models\AuditLog;
use App\Models\GameRoom;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
});

test('a player registers, logs in with a bearer token and reads their wallet', function () {
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mobile Player',
        'username' => 'mobileplayer',
        'email' => 'mobile@example.test',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
        'device_name' => 'Pixel 8',
    ])->assertCreated()->assertJsonStructure(['data' => ['token', 'user' => ['id', 'role']]]);

    $token = $this->postJson('/api/v1/auth/login', ['username' => 'mobileplayer', 'password' => 'secret123', 'device_name' => 'Pixel 8', 'platform' => 'android'])
        ->assertOk()->json('data.token');

    $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.role', 'player');
    $this->withToken($token)->getJson('/api/v1/wallet')->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('meta.cash_withdrawals_enabled', false);

    $this->withToken($token)->postJson('/api/v1/auth/logout')->assertOk();
});

test('invalid login is rejected', function () {
    User::factory()->create(['username' => 'someone']);

    $this->postJson('/api/v1/auth/login', ['username' => 'someone', 'password' => 'wrong'])->assertUnprocessable();
});

test('four players play a full game through the API', function () {
    $room = GameRoom::factory()->create();
    $players = User::factory()->count(4)->create();

    foreach ($players as $player) {
        fund($player, $room->entry_amount);
        $this->actingAs($player)->postJson("/api/v1/rooms/{$room->id}/join")->assertCreated();
    }

    $tableId = $this->actingAs($players[0])->getJson('/api/v1/tables/current')->json('data.id');

    foreach ($players as $player) {
        $this->actingAs($player)->postJson("/api/v1/tables/{$tableId}/ready", ['ready' => true])->assertOk();
    }

    $state = $this->actingAs($players[0])->getJson('/api/v1/tables/current')->assertOk()->json('data.session');
    expect($state['status'])->toBe('ARRANGING')
        ->and($state['my_cards'])->toHaveCount(13)
        ->and($state['arrangements'])->toBeNull();

    $sessionId = $state['id'];

    // Another player cannot fetch my cards.
    $this->actingAs(User::factory()->create())->getJson("/api/v1/games/{$sessionId}/cards")->assertForbidden();

    $this->actingAs($players[0])->getJson("/api/v1/games/{$sessionId}/results")->assertStatus(409);

    foreach ($players as $player) {
        $cards = $this->actingAs($player)->getJson("/api/v1/games/{$sessionId}/cards")->json('data.cards');
        $a = AutoArranger::arrange($cards);
        $this->actingAs($player)->postJson("/api/v1/games/{$sessionId}/submit", ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back])->assertCreated();
    }

    $this->actingAs($players[0])->postJson("/api/v1/games/{$sessionId}/submit", ['front' => ['2C', '3C', '4C'], 'middle' => ['5C', '6C', '7C', '8C', '9C'], 'back' => ['TC', 'JC', 'QC', 'KC', 'AC']])
        ->assertStatus(409);

    $results = $this->actingAs($players[1])->getJson("/api/v1/games/{$sessionId}/results")->assertOk()->json('data');

    expect($results['results'])->toHaveCount(4)
        ->and(array_sum(array_column($results['results'], 'score')))->toBe(0)
        ->and($results['server_seed'])->not->toBeNull()
        ->and(Deck::verify($results['server_seed'], $results['deck_commitment']))->toBeTrue();

    $this->actingAs($players[0])->getJson('/api/v1/profile/games')->assertOk()->assertJsonPath('data.0.id', $sessionId);
    $this->actingAs($players[0])->getJson('/api/v1/leaderboard')->assertOk()->assertJsonCount(4, 'data');
});

test('room listing hides private rooms and flags disabled CP rooms', function () {
    GameRoom::factory()->create(['name' => 'Public VC']);
    GameRoom::factory()->cp()->create(['name' => 'CP Room']);
    GameRoom::factory()->create(['name' => 'Secret', 'visibility' => 'private']);

    $rooms = $this->actingAs(User::factory()->create())->getJson('/api/v1/rooms')->assertOk()->json('data');

    expect(collect($rooms)->pluck('name')->all())->not->toContain('Secret')
        ->and(collect($rooms)->firstWhere('name', 'CP Room')['enabled'])->toBeFalse();
});

test('players create private rooms but cannot choose the payout mode', function () {
    $player = User::factory()->create();

    $room = $this->actingAs($player)->postJson('/api/v1/rooms/private', ['name' => 'Friends', 'entry_amount' => '50', 'payout_mode' => 'round_bank'])
        ->assertCreated()->json('data');

    expect($room['visibility'])->toBe('private')
        ->and($room['currency'])->toBe('VC')
        ->and($room['payout_mode'])->toBe(config('pusoy.private_room_payout_mode'));
});

test('admins manage rooms through the API and edits are audited', function () {
    $super = superAdmin();

    $room = $this->actingAs($super)->postJson('/api/v1/admin/rooms', [
        'name' => 'Admin Room', 'currency' => 'VC', 'entry_amount' => '90', 'payout_mode' => 'round_bank',
        'platform_fee_bps' => 500, 'point_value' => '10', 'arrangement_seconds' => 60, 'tie_handling' => 'split_equally',
        'timeout_policy' => 'auto_arrange', 'visibility' => 'public', 'status' => 'active',
    ])->assertCreated()->json('data');

    $this->actingAs($super)->postJson('/api/v1/admin/rooms', [
        'name' => 'Bad', 'currency' => 'VC', 'entry_amount' => '90', 'payout_mode' => 'round_bank',
        'platform_fee_bps' => 500, 'point_value' => '11', 'arrangement_seconds' => 60, 'tie_handling' => 'split_equally',
        'timeout_policy' => 'auto_arrange', 'visibility' => 'public', 'status' => 'active',
    ])->assertUnprocessable()->assertJsonValidationErrors('point_value');

    $this->actingAs(User::factory()->create())->postJson('/api/v1/admin/rooms', [])->assertForbidden();

    expect(AuditLog::query()->where('action', 'room.create')->where('subject_id', $room['id'])->exists())->toBeTrue();
});
