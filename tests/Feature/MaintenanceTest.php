<?php

use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\Users\UserManagementService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
});

/** Super Admin, an Administrator, an agent with Chips and commission, and its player. */
function mtWorld(): array
{
    $super = superAdmin();
    $admin = User::factory()->create(['role' => Role::Administrator]);
    $agent = User::factory()->agent()->create();
    $player = app(UserManagementService::class)->create($agent, Role::Player, ['name' => 'P', 'username' => 'mtplayer', 'email' => 'mt@t.test', 'password' => 'secret123']);
    fund($agent, 100_000);
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::CommissionPayment, Currency::CH, null, app(WalletService::class)->for($agent, Currency::CH, WalletType::Commission), 5_000));

    return compact('super', 'admin', 'agent', 'player');
}

function mtSet($test, User $by, string $mode)
{
    return $test->actingAs($by)->putJson('/api/v1/admin/maintenance', ['mode' => $mode]);
}

/** @return array{game: bool, tx: bool} which areas are open right now, probed through the API. */
function mtProbe($test, array $w): array
{
    $game = $test->actingAs($w['player'])->getJson('/api/v1/lobbies')->status();
    $tx = $test->actingAs($w['agent'])->postJson("/api/v1/agent/panel/accounts/{$w['player']->id}/load", ['amount' => '1'])->status();

    return ['game' => $game !== 503, 'tx' => $tx !== 503];
}

test('only Admins can read or change maintenance; it is audited with who, when, before and after', function () {
    $w = mtWorld();
    foreach ([$w['agent'], $w['player']] as $u) {
        $this->actingAs($u)->getJson('/api/v1/admin/maintenance')->assertForbidden();
        mtSet($this, $u, 'full')->assertForbidden();
    }
    mtSet($this, $w['super'], 'nonsense')->assertStatus(422);

    $this->getJson('/api/v1/status')->assertOk()->assertJsonPath('data.mode', 'off'); // public
    mtSet($this, $w['admin'], 'mobile_game')->assertOk()->assertJsonPath('data.mode', 'mobile_game')->assertJsonPath('data.game_blocked', true);
    mtSet($this, $w['super'], 'full')->assertOk();

    $log = AuditLog::query()->where('action', 'maintenance.mode')->latest('id')->first();
    expect($log->actor_id)->toBe($w['super']->id)->and($log->old_values['mode'])->toBe('mobile_game')->and($log->new_values['mode'])->toBe('full')->and($log->created_at)->not->toBeNull();
    $this->actingAs($w['admin'])->getJson('/api/v1/admin/maintenance')->assertOk()
        ->assertJsonPath('data.mode', 'full')->assertJsonCount(4, 'meta.modes')->assertJsonPath('meta.history.0.to', 'full');
});

test('each mode closes exactly what the matrix says', function () {
    $w = mtWorld();

    foreach (['off' => [true, true], 'full' => [false, false], 'mobile_game' => [false, true], 'agents_players' => [true, false]] as $mode => [$game, $tx]) {
        mtSet($this, $w['super'], $mode)->assertOk();
        $this->getJson('/api/v1/status')->assertJsonPath('data.game_blocked', ! $game)->assertJsonPath('data.transactions_blocked', ! $tx);
        expect(mtProbe($this, $w))->toBe(['game' => $game, 'tx' => $tx], "mode {$mode}");
    }
});

test('Full Maintenance: the game and its sign-in in the app are closed; every agent and player transaction is refused on the server', function () {
    $w = mtWorld();
    mtSet($this, $w['super'], 'full')->assertOk();
    $before = app(WalletService::class)->reconcile();

    foreach (['/api/v1/lobbies', '/api/v1/rooms', '/api/v1/tables/current', '/api/v1/practice/tiers'] as $url) {
        $this->actingAs($w['player'])->getJson($url)->assertStatus(503)->assertJsonPath('error', 'maintenance')->assertJsonPath('maintenance.mode', 'full');
    }
    $this->postJson('/api/v1/auth/login', ['username' => 'mtplayer', 'password' => 'secret123', 'platform' => 'android'])->assertStatus(503)->assertJsonPath('error', 'maintenance');

    $blocked = [
        [$w['agent'], 'post', "/api/v1/agent/panel/accounts/{$w['player']->id}/load", ['amount' => '1']],
        [$w['agent'], 'post', "/api/v1/agent/panel/accounts/{$w['player']->id}/withdraw", ['amount' => '1']],
        [$w['agent'], 'post', '/api/v1/agent/chip-requests', ['amount' => '10']],
        [$w['agent'], 'post', '/api/v1/agent/payout-requests', ['amount' => '10']],
        [$w['agent'], 'post', '/api/v1/commission/convert', ['amount' => '10', 'request_id' => 'm1']],
        [$w['super'], 'post', "/api/v1/admin/panel/accounts/{$w['agent']->id}/load", ['amount' => '1']],
        [$w['super'], 'post', "/api/v1/admin/panel/accounts/{$w['player']->id}/withdraw", ['amount' => '1']],
        [$w['super'], 'post', '/api/v1/wallet/allocate', ['recipient_id' => $w['player']->id, 'currency' => 'CH', 'amount' => '1']],
    ];
    foreach ($blocked as [$who, $method, $url, $body]) {
        $this->actingAs($who)->{$method.'Json'}($url, $body)->assertStatus(503)->assertJsonPath('error', 'maintenance');
    }
    expect(app(WalletService::class)->reconcile())->toBe($before);

    // Viewing still works; the Admin's own Chips (not an agent or player) still work.
    $this->actingAs($w['agent'])->getJson('/api/v1/agent/panel/overview')->assertOk();
    $this->actingAs($w['agent'])->getJson('/api/v1/commission/wallet')->assertOk();
    $this->actingAs($w['super'])->postJson('/api/v1/admin/panel/issue', ['amount' => '5'])->assertCreated();
    $this->actingAs($w['super'])->postJson("/api/v1/admin/panel/accounts/{$w['admin']->id}/load", ['amount' => '5'])->assertCreated();
});

test('Mobile Game: only the game closes; panels keep every transaction', function () {
    $w = mtWorld();
    mtSet($this, $w['super'], 'mobile_game')->assertOk();

    $this->actingAs($w['player'])->postJson('/api/v1/lobbies/quick-join')->assertStatus(503);
    $this->postJson('/api/v1/auth/login', ['username' => 'mtplayer', 'password' => 'secret123', 'platform' => 'ios'])->assertStatus(503);
    $this->actingAs($w['agent'])->postJson('/api/v1/commission/convert', ['amount' => '10', 'request_id' => 'm2'])->assertOk();
    $this->actingAs($w['super'])->postJson("/api/v1/admin/panel/accounts/{$w['player']->id}/load", ['amount' => '3'])->assertCreated();
});

test('Agents/Players: transactions close, the game keeps running', function () {
    $w = mtWorld();
    mtSet($this, $w['super'], 'agents_players')->assertOk();

    $this->actingAs($w['player'])->getJson('/api/v1/lobbies')->assertOk();
    $this->postJson('/api/v1/auth/login', ['username' => 'mtplayer', 'password' => 'secret123', 'platform' => 'android'])->assertOk();
    $this->actingAs($w['agent'])->postJson('/api/v1/commission/convert', ['amount' => '10', 'request_id' => 'm3'])->assertStatus(503);

    // OFF restores everything.
    mtSet($this, $w['super'], 'off')->assertOk();
    $this->actingAs($w['agent'])->postJson('/api/v1/commission/convert', ['amount' => '10', 'request_id' => 'm4'])->assertOk();
});

test('the panels get the current mode on every page', function () {
    $w = mtWorld();
    mtSet($this, $w['super'], 'agents_players')->assertOk();
    $this->actingAs($w['agent'])->get('/agent')->assertOk()
        ->assertInertia(fn ($page) => $page->where('maintenance.mode', 'agents_players')->where('maintenance.transactions_blocked', true));
});
