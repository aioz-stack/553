<?php

use App\Enums\Role;
use App\Models\User;
use App\Services\Users\ReferralService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

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
    $silver = $join($master->referral_code, 'agent', 'pasilver');
    $player = $join($silver->referral_code, 'player', 'paplayer');
    $super->forceFill(['username' => 'pasuper', 'password' => 'secret123'])->save();
    $admin = User::factory()->create(['role' => Role::Administrator, 'username' => 'paadmin', 'password' => 'secret123']);
    $loader = User::factory()->create(['role' => Role::Loader, 'username' => 'paloader', 'password' => 'secret123']);

    return compact('super', 'admin', 'loader', 'agent', 'master', 'silver', 'player');
}

test('login matrix: Web App for Admins, staff and every agent level; Mobile Game for Players only', function () {
    $a = paAccounts();

    foreach ($a as $role => $user) {
        $isPlayer = $role === 'player';

        // Web App (browser session).
        $web = $this->post('/login', ['username' => $user->username, 'password' => 'secret123']);
        if ($isPlayer) {
            $web->assertSessionHasErrors('platform');
            $this->assertGuest();
        } else {
            $web->assertRedirect('/dashboard');
            $this->assertAuthenticatedAs($user);
        }
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

test('the web refusal tells the player to use the mobile app', function () {
    paAccounts();
    $this->post('/login', ['username' => 'paplayer', 'password' => 'secret123'])
        ->assertSessionHasErrors(['platform' => 'Player accounts can only access Pusoy553 through the official Mobile Game application.']);
});

test('an app token of a non-player cannot be used (and is revoked); a player token works', function () {
    $a = paAccounts();

    foreach (['super', 'admin', 'loader', 'agent', 'master', 'silver'] as $role) {
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

test('a player browser session cannot be used on the web or its API; staff sessions work', function () {
    $a = paAccounts();

    $this->actingAs($a['player'])->get('/dashboard')->assertRedirect('/');
    $this->assertGuest();
    $this->actingAs($a['player'])->getJson('/api/v1/wallet')->assertForbidden()->assertJsonPath('error', 'mobile_only');

    $this->actingAs($a['super'])->get('/admin')->assertOk();
    $this->actingAs($a['master'])->get('/agent')->assertOk();
    $this->actingAs($a['silver'])->getJson('/api/v1/agent/panel/overview')->assertOk();
    $this->actingAs($a['loader'])->get('/loader')->assertOk();
});

test('existing features keep working on the right platform: maintenance and the player switch still apply', function () {
    paAccounts();
    $this->actingAs(User::query()->where('username', 'pasuper')->first())->putJson('/api/v1/admin/maintenance', ['mode' => 'mobile_game'])->assertOk();
    app('auth')->forgetGuards();
    $this->postJson('/api/v1/auth/login', ['username' => 'paplayer', 'password' => 'secret123', 'platform' => 'android'])->assertStatus(503);

    config(['pusoy.features.player_login' => false]);
    $this->postJson('/api/v1/auth/login', ['username' => 'paplayer', 'password' => 'secret123'])->assertForbidden()->assertJsonPath('error', 'player_login_disabled');
});
