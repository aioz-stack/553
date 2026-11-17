<?php

use App\Enums\Currency;
use App\Models\User;
use App\Models\UserDevice;
use App\Notifications\GameStarted;
use App\Notifications\PointsReceived;
use App\Services\Wallet\AllocationService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
});

/**
 * A throwaway service-account file with a freshly generated RSA key.
 */
function fakeFcmCredentials(): string
{
    // Windows PHP builds (e.g. XAMPP) need an explicit openssl.cnf to generate keys.
    $options = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
    $cnf = collect([getenv('OPENSSL_CONF'), dirname(PHP_BINARY).'/extras/ssl/openssl.cnf', 'C:/xampp/apache/conf/openssl.cnf'])
        ->first(fn ($p) => $p && is_file($p));

    if ($cnf) {
        $options['config'] = $cnf;
    }

    $key = openssl_pkey_new($options);
    openssl_pkey_export($key, $pem, null, $cnf ? ['config' => $cnf] : []);
    $path = tempnam(sys_get_temp_dir(), 'fcm');
    file_put_contents($path, json_encode(['client_email' => 'push@test.iam.gserviceaccount.com', 'private_key' => $pem]));

    config(['services.fcm.project_id' => 'pusoy-test', 'services.fcm.credentials' => $path]);

    return $path;
}

function mobileLogin(User $user): string
{
    return test()->postJson('/api/v1/auth/login', ['username' => $user->username, 'password' => 'password', 'device_name' => 'Pixel', 'platform' => 'android'])->json('data.token');
}

test('a mobile device registers its push token', function () {
    $player = User::factory()->create();
    $token = mobileLogin($player);

    $this->withToken($token)->putJson('/api/v1/auth/devices/push-token', ['token' => 'fcm-abc', 'platform' => 'android'])
        ->assertOk()->assertJsonPath('data.push_enabled', true);

    expect(UserDevice::query()->where('user_id', $player->id)->value('push_token'))->toBe('fcm-abc');

    $this->withToken($token)->putJson('/api/v1/auth/devices/push-token', ['token' => null])->assertJsonPath('data.push_enabled', false);
});

test('push tokens cannot be registered from a web session', function () {
    $this->actingAs(User::factory()->create())->putJson('/api/v1/auth/devices/push-token', ['token' => 'x'])->assertStatus(422);
});

test('allocations notify the recipient and game starts notify every player', function () {
    Notification::fake();

    $agent = User::factory()->agent()->create();
    app(AllocationService::class)->allocate(superAdmin(), $agent, Currency::VC, 10_000);
    Notification::assertSentTo($agent, PointsReceived::class);

    [, , $players] = startGame();
    foreach ($players as $player) {
        Notification::assertSentTo($player, GameStarted::class, fn (GameStarted $n) => ! str_contains(json_encode($n->toPush($player)), '"cards"'));
    }
});

test('push messages go to FCM v1 with an OAuth token and dead tokens are forgotten', function () {
    fakeFcmCredentials();
    Http::fake([
        'oauth2.googleapis.com/*' => Http::response(['access_token' => 'ya29.test', 'expires_in' => 3600]),
        'fcm.googleapis.com/*' => Http::sequence()
            ->push(['name' => 'projects/pusoy-test/messages/1'])
            ->push(['error' => ['status' => 'UNREGISTERED']], 404),
    ]);

    $player = User::factory()->create();
    UserDevice::create(['user_id' => $player->id, 'device_name' => 'A', 'push_token' => 'good-token']);
    UserDevice::create(['user_id' => $player->id, 'device_name' => 'B', 'push_token' => 'dead-token']);

    fund($player, 500);

    Http::assertSent(fn ($r) => str_contains($r->url(), 'fcm.googleapis.com/v1/projects/pusoy-test/messages:send')
        && $r->hasHeader('Authorization', 'Bearer ya29.test')
        && $r['message']['token'] === 'good-token'
        && $r['message']['notification']['title'] === 'Points received');

    expect(UserDevice::query()->where('device_name', 'B')->value('push_token'))->toBeNull()
        ->and(UserDevice::query()->where('device_name', 'A')->value('push_token'))->toBe('good-token');
});

test('without FCM credentials pushes are only logged', function () {
    config(['services.fcm.project_id' => null, 'services.fcm.credentials' => null]);
    Http::fake();

    $player = User::factory()->create();
    UserDevice::create(['user_id' => $player->id, 'device_name' => 'A', 'push_token' => 'token']);
    fund($player, 500);

    Http::assertNothingSent();
});
