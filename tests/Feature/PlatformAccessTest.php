<?php

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\User;
use App\Services\Users\ReferralService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
    config(['pusoy.features.platform_lock' => true, 'pusoy.features.player_login' => true]);
});

/** One account of every role, password "secret123". @return array<string, User> */
function paAccounts(): array
{
    $super = superAdmin();
    $refs = app(ReferralService::class);
    $join = fn (string $code, string $type, string $u) => $refs->approve($super, $refs->register(['name' => $u, 'username' => $u, 'email' => "{$u}@t.test", 'password' => 'secret123'], $code, $type));
    $agent = $join($refs->codeFor($super), 'agent', 'paagent');
    $master = $join($agent->referral_code, 'agent', 'pamaster');
    $player = $join($master->referral_code, 'player', 'paplayer');
    $super->forceFill(['username' => 'pasuper', 'password' => 'secret123'])->save();
    $admin = User::factory()->create(['role' => Role::Administrator, 'username' => 'paadmin', 'password' => 'secret123']);
    $loader = User::factory()->create(['role' => Role::Loader, 'username' => 'paloader', 'password' => 'secret123']);

    return compact('super', 'admin', 'loader', 'agent', 'master', 'player');
}

test('login matrix: Web App for every role (players included); Mobile Game for Players only', function () {
    $a = paAccounts();

    foreach ($a as $role => $user) {
        $isPlayer = $role === 'player';

        // Web App (browser session): every role signs in and goes to /dashboard (players stay there).
        $this->post('/login', ['username' => $user->username, 'password' => 'secret123'])->assertRedirect('/dashboard')->assertSessionHasNoErrors();
        $this->assertAuthenticatedAs($user);
        $this->post('/logout');
        app('auth')->forgetGuards();

        // Mobile Game (app token) — any platform value the request claims.
        foreach (['android', 'ios', 'web', null] as $platform) {
            $app = $this->postJson('/api/v1/auth/login', array_filter(['username' => $user->username, 'password' => 'secret123', 'platform' => $platform]));
            if ($isPlayer) {
                $app->assertOk()->assertJsonStructure(['data' => ['token']]);
            } else {
                $app->assertForbidden()->assertJsonPath('error', 'web_only')->assertJsonPath('message', 'Mobile Game Access Restricted. Your account is authorized to access the Pusoy553 Web Platform only. Please use the Web App to log in.');
            }
        }
        expect($user->tokens()->count())->toBe($isPlayer ? 4 : 0, "{$role} tokens");
    }
});

test('a player signs in on the web, lands on the player dashboard, and can log out', function () {
    paAccounts();
    $this->post('/login', ['username' => 'paplayer', 'password' => 'secret123'])->assertRedirect('/dashboard');
    $this->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page->component('Dashboard')->where('auth.user.role', 'player'));
    expect(User::where('username', 'paplayer')->value('last_login_at'))->not->toBeNull();

    $this->post('/logout')->assertRedirect('/');
    $this->assertGuest();
    $this->get('/dashboard')->assertRedirect('/');
});

test('wrong credentials, and pending players, are refused with a clear message', function () {
    $a = paAccounts();
    $this->post('/login', ['username' => 'paplayer', 'password' => 'wrong-pass'])->assertSessionHasErrors(['username' => 'The provided credentials do not match our records.']);
    $this->post('/login', ['username' => 'nobody', 'password' => 'secret123'])->assertSessionHasErrors('username');
    $this->assertGuest();

    $a['player']->forceFill(['status' => UserStatus::Pending])->save();
    $this->post('/login', ['username' => 'paplayer', 'password' => 'secret123'])->assertSessionHasErrors('username');
    $this->assertGuest();
});

test('an app token of a non-player cannot be used (and is revoked); a player token works', function () {
    $a = paAccounts();

    foreach (['super', 'admin', 'loader', 'agent', 'master'] as $role) {
        $token = $a[$role]->createToken('old phone')->plainTextToken; // e.g. issued before the lock
        app('auth')->forgetGuards();
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertForbidden()->assertJsonPath('error', 'web_only');
        expect($a[$role]->tokens()->count())->toBe(0, $role);
    }

    $token = $a['player']->createToken('phone')->plainTextToken;
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.username', 'paplayer');
    $this->withToken($token)->getJson('/api/v1/wallet')->assertOk();
});

test('a player web session works for player pages and its API, never for the Admin, agent or Loader panels', function () {
    $a = paAccounts();

    $this->actingAs($a['player'])->get('/dashboard')->assertOk();
    $this->actingAs($a['player'])->get('/wallet')->assertOk();
    $this->actingAs($a['player'])->getJson('/api/v1/wallet')->assertOk();
    foreach (['/admin', '/admin/revenue-logs', '/admin/accounts/agents', '/agent', '/agent/revenue-logs', '/loader'] as $url) {
        $this->actingAs($a['player'])->get($url)->assertForbidden();
    }
    foreach (['/api/v1/admin/panel/overview', '/api/v1/agent/panel/overview', '/api/v1/loader/panel/overview', '/api/v1/team/overview', '/api/v1/revenue'] as $url) {
        $this->actingAs($a['player'])->getJson($url)->assertForbidden();
    }

    $this->actingAs($a['super'])->get('/admin')->assertOk();
    $this->actingAs($a['master'])->get('/agent')->assertOk();
    $this->actingAs($a['master'])->getJson('/api/v1/agent/panel/overview')->assertOk();
    $this->actingAs($a['loader'])->get('/loader')->assertOk();
});

test('existing features keep working on the right platform: maintenance and the player switch still apply', function () {
    paAccounts();
    // Player sign-in switched off: the web sign-in refuses players too.
    config(['pusoy.features.player_login' => false]);
    $this->post('/login', ['username' => 'paplayer', 'password' => 'secret123'])->assertSessionHasErrors(['username' => User::SIGN_IN_DISABLED_MESSAGE]);
    $this->assertGuest();
    config(['pusoy.features.player_login' => true]);

    $this->actingAs(User::query()->where('username', 'pasuper')->first())->putJson('/api/v1/admin/maintenance', ['mode' => 'mobile_game'])->assertOk();
    app('auth')->forgetGuards();
    $this->postJson('/api/v1/auth/login', ['username' => 'paplayer', 'password' => 'secret123', 'platform' => 'android'])->assertStatus(503);

    config(['pusoy.features.player_login' => false]);
    $this->postJson('/api/v1/auth/login', ['username' => 'paplayer', 'password' => 'secret123'])->assertForbidden()->assertJsonPath('error', 'player_login_disabled');
});
