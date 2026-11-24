<?php

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\TransactionType;
use App\Enums\UserStatus;
use App\Enums\WalletType;
use App\Models\AgentPayoutRequest;
use App\Models\AuditLog;
use App\Models\ChipLoad;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Agent\PayoutService;
use App\Services\Users\UserManagementService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
});

function laWorld($test, array $permissions = ['loader_loads', 'loader_commissions', 'loader_passwords']): array
{
    $super = superAdmin(); // holds a 1,000,000-Chip float
    $agent = User::factory()->agent()->create();
    $player = app(UserManagementService::class)->create($agent, Role::Player, ['name' => 'P', 'username' => 'laplayer', 'email' => 'lap@t.test', 'password' => 'secret123']);
    $test->actingAs($super)->postJson('/api/v1/admin/employees', [
        'role' => 'loader', 'name' => 'Lou Loader', 'username' => 'lou', 'email' => 'lou@t.test',
        'password' => 'loader123', 'password_confirmation' => 'loader123', 'permissions' => $permissions,
    ])->assertCreated()->assertJsonPath('data.role', 'loader')->assertJsonPath('data.employer.username', $super->username);
    $loader = User::query()->where('username', 'lou')->firstOrFail();

    return compact('super', 'agent', 'player', 'loader');
}

test('Admins create Loader Accounts with their own sign-in; only the Super Admin creates Administrators', function () {
    $w = laWorld($this);
    expect($w['loader']->role)->toBe(Role::Loader)->and(Hash::check('loader123', $w['loader']->password))->toBeTrue()
        ->and($w['loader']->abilityKeys())->toEqualCanonicalizing(['loader_loads', 'loader_commissions', 'loader_passwords']);

    $admin = User::factory()->create(['role' => Role::Administrator]);
    $payload = fn (string $u, string $role) => ['role' => $role, 'name' => $u, 'username' => $u, 'email' => "{$u}@t.test", 'password' => 'secret123', 'password_confirmation' => 'secret123'];
    $this->actingAs($admin)->postJson('/api/v1/admin/employees', $payload('loader2', 'loader'))->assertCreated();
    $this->actingAs($admin)->postJson('/api/v1/admin/employees', $payload('admin2', 'admin'))->assertForbidden();
    $this->actingAs($w['super'])->postJson('/api/v1/admin/employees', $payload('admin3', 'admin') + ['permissions' => ['manage_rooms']])->assertCreated()->assertJsonPath('data.permissions.0', 'manage_rooms');

    // A Loader can never be given an Admin ability, whatever the request says.
    $this->actingAs($w['super'])->putJson("/api/v1/admin/employees/{$w['loader']->id}/permissions", ['permissions' => ['loader_loads', 'manage_commissions', 'allocate_points']])->assertOk();
    expect($w['loader']->fresh()->abilityKeys())->toBe(['loader_loads'])
        ->and($w['loader']->fresh()->hasAbility(Ability::ManageCommissions))->toBeFalse();

    // Nobody but Admins reaches the Employees module.
    foreach ([$w['loader'], $w['agent'], $w['player']] as $u) {
        $this->actingAs($u)->getJson('/api/v1/admin/employees')->assertForbidden();
        $this->actingAs($u)->postJson('/api/v1/admin/employees', $payload('x'.$u->id, 'loader'))->assertForbidden();
    }
    // Search by name, username, role or status.
    $this->actingAs($w['super'])->getJson('/api/v1/admin/employees?q=Lou')->assertJsonPath('data.0.username', 'lou');
    $this->actingAs($w['super'])->getJson('/api/v1/admin/employees?role=admin')->assertJsonPath('meta.total', 2);
});

test('a Loader signs in with its own credentials and is sent to the Loader Panel', function () {
    $super = superAdmin();
    app(\App\Services\Users\EmployeeService::class)->create($super, Role::Loader, ['name' => 'Lou', 'username' => 'lou', 'email' => 'lou@t.test', 'password' => 'loader123'], ['loader_loads']);

    $this->post('/login', ['username' => 'lou', 'password' => 'loader123'])->assertRedirect('/dashboard');
    $this->get('/dashboard')->assertRedirect('/loader');
    $this->get('/loader')->assertOk()->assertInertia(fn ($page) => $page->component('LoaderPanel/Overview'));
});

test('a Loader lands on its own panel and cannot reach anything of the Admin Panel', function () {
    $w = laWorld($this);

    $this->actingAs($w['loader']);
    $this->get('/loader')->assertOk();
    foreach (['/admin', '/admin/maintenance', '/admin/employees', '/admin/settings', '/agent', '/lobby'] as $url) {
        $this->get($url)->assertForbidden();
    }
    foreach ([
        ['get', '/api/v1/admin/panel/overview'], ['put', '/api/v1/admin/maintenance'], ['put', '/api/v1/admin/panel/commission-rates'],
        ['post', '/api/v1/admin/users'], ['post', '/api/v1/admin/panel/issue'], ['get', '/api/v1/admin/employees'],
        ['post', "/api/v1/admin/panel/accounts/{$w['player']->id}/withdraw"], ['post', "/api/v1/admin/panel/accounts/{$w['agent']->id}/status"],
        ['get', '/api/v1/admin/settings'], ['post', '/api/v1/wallet/allocate'],
    ] as [$method, $url]) {
        expect($this->{$method.'Json'}($url, ['amount' => '1', 'mode' => 'off'])->status())->toBeIn([403, 404, 405], $url);
    }
    // Withdrawing Chips or Admin funds is not a Loader route at all.
    expect($this->postJson("/api/v1/loader/panel/accounts/{$w['player']->id}/withdraw", ['amount' => '1'])->status())->toBeIn([404, 405]);
});

test('Load Transactions: a Loader loads from its employer Admin\'s Chips, once, recorded as processed by the Loader', function () {
    $w = laWorld($this);
    $before = balance($w['super'], Currency::CH, WalletType::Allocation);

    $this->actingAs($w['loader'])->postJson("/api/v1/loader/panel/accounts/{$w['player']->id}/load", ['amount' => '250', 'idempotency_key' => 'L1'])->assertCreated()
        ->assertJsonPath('data.sender.username', $w['super']->username)->assertJsonPath('data.processed_by.username', 'lou');
    $this->actingAs($w['loader'])->postJson("/api/v1/loader/panel/accounts/{$w['player']->id}/load", ['amount' => '250', 'idempotency_key' => 'L1'])->assertCreated(); // retry: once

    expect(balance($w['player'], Currency::CH, WalletType::Player))->toBe(25_000)
        ->and(balance($w['super'], Currency::CH, WalletType::Allocation))->toBe($before - 25_000)
        ->and(ChipLoad::query()->where('processed_by', $w['loader']->id)->count())->toBe(1)
        ->and(WalletTransaction::query()->where('created_by', $w['loader']->id)->count())->toBe(1)
        ->and(AuditLog::query()->where('actor_id', $w['loader']->id)->where('action', 'wallet.allocate')->exists())->toBeTrue();

    // Lists, search and details.
    $this->actingAs($w['loader'])->getJson('/api/v1/loader/panel/load-logs?q=laplayer')->assertOk()->assertJsonPath('data.0.processed_by.username', 'lou');

    // A Chips request is approved from the employer's Chips too.
    $request = app(\App\Services\Wallet\ChipLoadService::class)->request($w['agent'], 10_000);
    $this->actingAs($w['loader'])->postJson("/api/v1/loader/panel/load-logs/{$request->id}/approve")->assertOk()->assertJsonPath('data.status', 'completed');
    expect($request->fresh()->processed_by)->toBe($w['loader']->id)->and($request->fresh()->sender_id)->toBe($w['super']->id);

    // Without the permission, or with an inactive employer, nothing loads.
    $w['loader']->permissions()->detach();
    $this->actingAs($w['loader']->fresh())->postJson("/api/v1/loader/panel/accounts/{$w['player']->id}/load", ['amount' => '1'])->assertForbidden();
    $this->actingAs($w['loader']->fresh())->getJson('/api/v1/loader/panel/load-logs')->assertForbidden();
    expect(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('a Loader whose employer Admin is no longer active cannot load', function () {
    $w = laWorld($this);
    $w['super']->forceFill(['status' => UserStatus::Suspended])->save();
    $this->actingAs($w['loader'])->postJson("/api/v1/loader/panel/accounts/{$w['player']->id}/load", ['amount' => '1'])->assertStatus(409)->assertJsonPath('error', 'no_employer');
});

test('Commission Transactions: a Loader reviews withdrawal requests but never touches rates', function () {
    $w = laWorld($this);
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::CommissionPayment, Currency::CH, null, app(WalletService::class)->for($w['agent'], Currency::CH, WalletType::Commission), 5_000));
    $payout = app(PayoutService::class)->request($w['agent']->agent, Currency::CH, 3_000, $w['agent']);

    $this->actingAs($w['loader'])->getJson('/api/v1/loader/panel/commission-logs')->assertOk();
    $this->actingAs($w['loader'])->getJson('/api/v1/loader/panel/withdrawals')->assertOk()->assertJsonPath('data.0.status', 'pending');
    $this->actingAs($w['loader'])->postJson("/api/v1/loader/panel/withdrawals/{$payout->id}/approve")->assertOk();
    expect(AgentPayoutRequest::query()->find($payout->id)->reviewed_by)->toBe($w['loader']->id)
        ->and(balance($w['agent'], Currency::CH, WalletType::Allocation))->toBe(3_000);

    $this->actingAs($w['loader'])->putJson('/api/v1/admin/panel/commission-rates', ['agent' => 99, 'master' => 1])->assertForbidden();
    expect($this->actingAs($w['loader'])->putJson('/api/v1/loader/panel/commission-rates', ['agent' => 99])->status())->toBeIn([404, 405]);
});

test('Reset Passwords: agents and players only, hashed, logged, never Admins', function () {
    $w = laWorld($this);
    $body = ['password' => 'fresh1234', 'password_confirmation' => 'fresh1234'];

    $this->actingAs($w['loader'])->getJson('/api/v1/loader/panel/accounts?q=laplay')->assertOk()->assertJsonPath('data.0.username', 'laplayer');
    $this->actingAs($w['loader'])->putJson("/api/v1/loader/panel/accounts/{$w['player']->id}/password", $body)->assertOk()->assertJsonMissingPath('data.password');
    expect(Hash::check('fresh1234', $w['player']->fresh()->password))->toBeTrue()
        ->and(AuditLog::query()->where('actor_id', $w['loader']->id)->where('action', 'user.password_reset')->exists())->toBeTrue();
    $this->actingAs($w['loader'])->putJson("/api/v1/loader/panel/accounts/{$w['agent']->id}/password", $body)->assertOk();

    foreach ([$w['super'], User::factory()->create(['role' => Role::Administrator]), User::factory()->create(['role' => Role::Loader])] as $staff) {
        expect($this->actingAs($w['loader'])->putJson("/api/v1/loader/panel/accounts/{$staff->id}/password", $body)->status())->toBeIn([403, 404]);
    }
    // Admin accounts are not even searchable.
    $this->actingAs($w['loader'])->getJson('/api/v1/loader/panel/accounts?q='.$w['super']->username)->assertJsonCount(0, 'data');
});

test('deactivating a Loader revokes access at once; reactivating restores it; deletion keeps history safe', function () {
    $w = laWorld($this);
    $token = $w['loader']->createToken('t')->plainTextToken;
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/v1/loader/panel/overview')->assertOk();

    $this->actingAs($w['super'])->postJson("/api/v1/admin/employees/{$w['loader']->id}/status", ['active' => false, 'reason' => 'Left the company'])->assertOk()->assertJsonPath('data.status', 'suspended');
    expect($w['loader']->tokens()->count())->toBe(0);
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/v1/loader/panel/overview')->assertUnauthorized();
    $this->postJson('/api/v1/auth/login', ['username' => 'lou', 'password' => 'loader123'])->assertForbidden();

    $this->actingAs($w['super'])->postJson("/api/v1/admin/employees/{$w['loader']->id}/status", ['active' => true])->assertOk();
    $this->actingAs($w['super'])->putJson("/api/v1/admin/employees/{$w['loader']->id}/password", ['password' => 'newpw1234', 'password_confirmation' => 'newpw1234'])->assertOk();
    app('auth')->forgetGuards();
    $this->postJson('/api/v1/auth/login', ['username' => 'lou', 'password' => 'newpw1234'])->assertOk();

    // Activity: what the Loader did.
    $this->actingAs($w['loader'])->postJson("/api/v1/loader/panel/accounts/{$w['player']->id}/load", ['amount' => '5'])->assertCreated();
    $this->actingAs($w['super'])->getJson("/api/v1/admin/employees/{$w['loader']->id}/activity")->assertOk()
        ->assertJsonPath('data.counts.loads_processed', 1)->assertJsonPath('data.username', 'lou');

    // With history: deactivate, not delete. A Loader that never acted can be deleted.
    $this->actingAs($w['super'])->deleteJson("/api/v1/admin/employees/{$w['loader']->id}")->assertStatus(409)->assertJsonPath('error', 'has_history');
    $this->actingAs($w['super'])->postJson('/api/v1/admin/employees', ['role' => 'loader', 'name' => 'Tmp', 'username' => 'tmploader', 'email' => 'tmp@t.test', 'password' => 'secret123', 'password_confirmation' => 'secret123'])->assertCreated();
    $tmp = User::query()->where('username', 'tmploader')->firstOrFail();
    $this->actingAs($w['super'])->deleteJson("/api/v1/admin/employees/{$tmp->id}")->assertOk();
    expect(User::query()->whereKey($tmp->id)->exists())->toBeFalse();

    // Admins never manage themselves or a Super Admin here.
    $this->actingAs($w['super'])->postJson("/api/v1/admin/employees/{$w['super']->id}/status", ['active' => false])->assertForbidden();
});

test('maintenance still applies to a Loader\'s loads', function () {
    $w = laWorld($this);
    $this->actingAs($w['super'])->putJson('/api/v1/admin/maintenance', ['mode' => 'agents_players'])->assertOk();
    $this->actingAs($w['loader'])->postJson("/api/v1/loader/panel/accounts/{$w['player']->id}/load", ['amount' => '1'])->assertStatus(503);
});
