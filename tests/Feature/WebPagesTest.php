<?php

use App\Enums\Ability;
use App\Models\GameRoom;
use App\Models\User;
use App\Services\Users\UserManagementService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    $this->seed(RolesAndPermissionsSeeder::class);
});

dataset('player pages', [
    ['/dashboard', 'Dashboard'],
    ['/lobby', 'Player/Lobby'],
    ['/rooms', 'Player/Rooms'],
    ['/wallet', 'Player/Wallet'],
    ['/transactions', 'Player/Transactions'],
    ['/history', 'Player/History'],
    ['/leaderboard', 'Player/Leaderboard'],
    ['/profile', 'Account/Profile'],
    ['/settings', 'Account/Settings'],
    ['/notifications', 'Account/Notifications'],
]);

dataset('agent pages', [
    ['/agent', 'Agent/Overview'],
    ['/agent/players', 'Agent/Players'],
    ['/agent/players/create', 'Agent/RegisterPlayer'],
    ['/agent/referral-codes', 'Agent/ReferralCodes'],
    ['/agent/allocate', 'Agent/Allocate'],
    ['/agent/balances', 'Agent/Balances'],
    ['/agent/transactions', 'Agent/Transactions'],
    ['/agent/activity', 'Agent/Activity'],
    ['/agent/commissions', 'Agent/Commissions'],
    ['/agent/reports', 'Agent/Reports'],
]);

dataset('admin pages', [
    ['/admin', 'Admin/Overview'],
    ['/admin/administrators', 'Admin/Users'],
    ['/admin/agents', 'Admin/Users'],
    ['/admin/players', 'Admin/Users'],
    ['/admin/rooms', 'Admin/Rooms'],
    ['/admin/tables', 'Admin/Tables'],
    ['/admin/sessions', 'Admin/Sessions'],
    ['/admin/wallets', 'Admin/Wallets'],
    ['/admin/allocations', 'Admin/Allocations'],
    ['/admin/transactions', 'Admin/Transactions'],
    ['/admin/commissions', 'Admin/Commissions'],
    ['/admin/reports', 'Admin/Reports'],
    ['/admin/audit-logs', 'Admin/AuditLogs'],
    ['/admin/settings', 'Admin/Settings'],
]);

test('player pages render for players', function (string $url, string $component) {
    $this->actingAs(User::factory()->create())->get($url)
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component($component)->where('auth.user.role', 'player'));
})->with('player pages');

test('agent pages render for agents and are hidden from players', function (string $url, string $component) {
    $this->actingAs(User::factory()->agent()->create())->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page->component($component));
    $this->actingAs(User::factory()->create())->get($url)->assertForbidden();
})->with('agent pages');

test('admin pages render for super admin and are hidden from agents and players', function (string $url, string $component) {
    $this->actingAs(superAdmin())->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page->component($component));
    $this->actingAs(User::factory()->agent()->create())->get($url)->assertForbidden();
    $this->actingAs(User::factory()->create())->get($url)->assertForbidden();
})->with('admin pages');

test('administrators only reach pages for their granted abilities', function () {
    $admin = User::factory()->administrator()->create();
    app(UserManagementService::class)->syncPermissions(superAdmin(), $admin, [Ability::ManageRooms->value]);
    $admin->refresh();

    $this->actingAs($admin)->get('/admin')->assertOk()->assertInertia(fn (Assert $page) => $page->where('auth.user.abilities', ['manage_rooms']));
    $this->actingAs($admin)->get('/admin/rooms')->assertOk();
    $this->actingAs($admin)->get('/admin/players')->assertForbidden();
    $this->actingAs($admin)->get('/admin/administrators')->assertForbidden();
    $this->actingAs($admin)->get('/admin/settings')->assertForbidden();
});

test('the dashboard forwards agents and staff to their own home', function () {
    $this->actingAs(User::factory()->agent()->create())->get('/dashboard')->assertRedirect('/agent');
    $this->actingAs(superAdmin())->get('/dashboard')->assertRedirect('/admin');
});

test('players can open the table page and staff cannot play', function () {
    [$table] = startGame(GameRoom::factory()->create(), ready: false);

    $this->actingAs(User::factory()->create())->get("/play/{$table->id}")->assertOk()->assertInertia(fn (Assert $page) => $page->component('Player/Table')->where('tableId', $table->id));
    $this->actingAs(superAdmin())->get('/lobby')->assertForbidden();
});

test('web registration creates a player and an optional agent link', function () {
    $agent = User::factory()->agent()->create();
    $code = app(UserManagementService::class)->createReferralCode($agent->agent);

    $this->post('/register', [
        'name' => 'Web Player',
        'username' => 'webplayer',
        'email' => 'web@example.test',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
        'referral_code' => $code->code,
    ])->assertRedirect('/dashboard');

    $player = User::query()->where('username', 'webplayer')->firstOrFail();
    expect($player->isPlayer())->toBeTrue()
        ->and($player->agentLink->agent_id)->toBe($agent->agent->id)
        ->and($code->fresh()->uses)->toBe(1);
});

test('suspended users cannot log in on the web', function () {
    User::factory()->suspended()->create(['username' => 'frozen', 'password' => 'password']);

    $this->post('/login', ['username' => 'frozen', 'password' => 'password'])->assertSessionHasErrors('username');
    $this->assertGuest();
});
