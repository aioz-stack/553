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
    ['/agent', 'AdminPanel/Overview'],
    ['/agent/load-logs', 'AdminPanel/LoadLogs'],
    ['/agent/revenue-logs', 'AdminPanel/RevenueLogs'],
    ['/agent/revenue-withdrawals', 'AdminPanel/RevenueWithdrawals'],
    ['/agent/accounts/agents', 'AdminPanel/Accounts'],
    ['/agent/accounts/active-players', 'AdminPanel/Accounts'],
    ['/agent/accounts/pending-users', 'AdminPanel/Accounts'],
    ['/agent/change-password', 'AdminPanel/ChangePassword'],
]);

dataset('admin pages', [
    ['/admin', 'AdminPanel/Overview'],
    ['/admin/reset-password', 'AdminPanel/ResetPassword'],
    ['/admin/maintenance', 'AdminPanel/Maintenance'],
    ['/admin/employees', 'AdminPanel/Employees'],
    ['/admin/load-logs', 'AdminPanel/LoadLogs'],
    ['/admin/revenue-logs', 'AdminPanel/RevenueLogs'],
    ['/admin/revenue-withdrawals', 'AdminPanel/RevenueWithdrawals'],
    ['/admin/revenue-rates', 'AdminPanel/RevenueRates'],
    ['/admin/accounts/agents', 'AdminPanel/Accounts'],
    ['/admin/accounts/pending-users', 'AdminPanel/Accounts'],
    ['/admin/accounts/archive', 'AdminPanel/Accounts'],
    ['/admin/change-password', 'AdminPanel/ChangePassword'],
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

test('the retired agent tools (Register Player, Referral Codes, the old agent pages) are gone', function () {
    $agent = User::factory()->agent()->create();
    foreach (['/agent/players', '/agent/players/create', '/agent/referral-codes', '/agent/allocate', '/agent/balances', '/agent/transactions', '/agent/activity', '/agent/commissions', '/agent/reports', '/agent/commission-logs', '/agent/commission-withdrawals'] as $url) {
        $this->actingAs($agent)->get($url)->assertNotFound();
    }
});

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

test('web registration through an agent\'s Player Registration Link waits for approval, then links the player to the agent', function () {
    $agent = User::factory()->agent()->create();
    $code = (object) ['code' => app(\App\Services\Users\ReferralService::class)->codeFor($agent)];

    $this->post('/register', [
        'name' => 'Web Player',
        'username' => 'webplayer',
        'email' => 'web@example.test',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
        'referral_code' => $code->code,
    ])->assertRedirect('/');

    $player = User::query()->where('username', 'webplayer')->firstOrFail();
    expect($player->isPlayer())->toBeTrue()
        ->and($player->status->value)->toBe('pending')
        ->and($player->sponsor_id)->toBe($agent->id)
        ->and($player->agentLink)->toBeNull();

    app(\App\Services\Users\ReferralService::class)->approve(superAdmin(), $player);
    expect($player->fresh()->agentLink->agent_id)->toBe($agent->agent->id);
});

test('suspended users cannot log in on the web', function () {
    User::factory()->suspended()->create(['username' => 'frozen', 'password' => 'password']);

    $this->post('/login', ['username' => 'frozen', 'password' => 'password'])->assertSessionHasErrors('username');
    $this->assertGuest();
});
