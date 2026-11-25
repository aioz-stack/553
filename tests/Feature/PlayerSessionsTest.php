<?php

use App\Enums\Role;
use App\Events\Game\UserEvent;
use App\Models\User;
use App\Services\Users\PlayerSessions;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\PersonalAccessToken;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
});

function psPlayer(): User
{
    return User::factory()->player()->create(['username' => 'solo', 'password' => 'secret123']);
}

function psLogin($test, string $device = 'phone-a')
{
    app('auth')->forgetGuards();

    return $test->postJson('/api/v1/auth/login', ['username' => 'solo', 'password' => 'secret123', 'device_name' => $device]);
}

test('a second login while the first is active disconnects BOTH; logging in again works', function () {
    Event::fake([UserEvent::class]);
    $player = psPlayer();
    $first = psLogin($this)->assertOk()->json('data.token');
    // The first device is in use.
    $this->withToken($first)->getJson('/api/v1/auth/me')->assertOk();

    // Second device: refused, and every session of the account is signed out.
    psLogin($this, 'phone-b')->assertStatus(409)->assertJsonPath('error', PlayerSessions::ERROR)
        ->assertJsonPath('message', PlayerSessions::TITLE.'. '.PlayerSessions::MESSAGE);
    expect(PersonalAccessToken::query()->where('tokenable_id', $player->id)->count())->toBe(0);
    Event::assertDispatched(UserEvent::class, fn ($e) => $e->userId === $player->id && $e->name === 'account.disconnected');

    // The original device is out too, and told why.
    app('auth')->forgetGuards();
    $this->withToken($first)->getJson('/api/v1/wallet')->assertUnauthorized()
        ->assertJsonPath('error', PlayerSessions::ERROR)->assertJsonPath('title', 'Account Already Connected');
    expect(\App\Models\AuditLog::query()->where('action', 'player.sessions_disconnected')->count())->toBe(1);

    // A fresh login (nothing active any more) works, and is the only session.
    $again = psLogin($this, 'phone-b')->assertOk()->json('data.token');
    app('auth')->forgetGuards();
    $this->withToken($again)->getJson('/api/v1/auth/me')->assertOk();
    expect(PersonalAccessToken::query()->where('tokenable_id', $player->id)->count())->toBe(1);
});

test('a third login during a duplicate is refused the same way; nobody keeps a session', function () {
    psPlayer();
    $a = psLogin($this)->json('data.token');
    psLogin($this, 'b')->assertStatus(409);
    // The duplicate left nothing active: the next login succeeds…
    $c = psLogin($this, 'c')->assertOk()->json('data.token');
    // …and another device while c is active disconnects everything again.
    psLogin($this, 'd')->assertStatus(409)->assertJsonPath('error', PlayerSessions::ERROR);
    foreach ([$a, $c] as $t) {
        app('auth')->forgetGuards();
        $this->withToken($t)->getJson('/api/v1/auth/me')->assertUnauthorized();
    }
});

test('a stale session (not used recently) is simply replaced, and that device is told it signed in elsewhere', function () {
    $player = psPlayer();
    $old = psLogin($this)->json('data.token');
    PersonalAccessToken::query()->where('tokenable_id', $player->id)->update(['last_used_at' => now()->subMinutes(PlayerSessions::activeMinutes() + 5)]);

    $new = psLogin($this, 'new phone')->assertOk()->json('data.token');
    expect(PersonalAccessToken::query()->where('tokenable_id', $player->id)->count())->toBe(1);
    app('auth')->forgetGuards();
    $this->withToken($old)->getJson('/api/v1/auth/me')->assertUnauthorized()->assertJsonPath('error', 'session_replaced');
    app('auth')->forgetGuards();
    $this->withToken($new)->getJson('/api/v1/auth/me')->assertOk();
});

test('web sign-in while the account is active in the app: refused with the message, and the app is signed out', function () {
    config(['pusoy.features.platform_lock' => true]);
    $player = psPlayer();
    $token = psLogin($this)->json('data.token');
    app('auth')->forgetGuards();

    $this->post('/login', ['username' => 'solo', 'password' => 'secret123'])->assertSessionHasErrors(['session' => PlayerSessions::MESSAGE]);
    $this->assertGuest();
    expect(PersonalAccessToken::query()->where('tokenable_id', $player->id)->count())->toBe(0);
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/v1/auth/me')->assertUnauthorized()->assertJsonPath('error', PlayerSessions::ERROR);

    // Then the web sign-in works.
    $this->post('/login', ['username' => 'solo', 'password' => 'secret123'])->assertRedirect('/dashboard');
    $this->assertAuthenticatedAs($player);
});

test('a disconnected browser session is sent to the login page with the reason', function () {
    // The browser comes back with the id of its (deleted) session.
    $id = str_repeat('a', 40);
    \Illuminate\Support\Facades\Cache::put("player-session:web:{$id}", 'duplicate_login', 600);

    $this->withCookie(config('session.cookie'), $id)->get('/')->assertRedirect('/')->assertSessionHasErrors(['session' => PlayerSessions::MESSAGE]);
    // Once only.
    $this->withCookie(config('session.cookie'), $id)->get('/')->assertOk();
});

test('staff and agents are not limited to one session', function () {
    $admin = User::factory()->create(['role' => Role::Administrator, 'username' => 'boss', 'password' => 'secret123']);
    foreach ([1, 2] as $_) {
        $this->post('/login', ['username' => 'boss', 'password' => 'secret123'])->assertRedirect('/dashboard');
        $this->post('/logout');
        app('auth')->forgetGuards();
    }
    expect(\App\Models\AuditLog::query()->where('action', 'player.sessions_disconnected')->count())->toBe(0);
});
