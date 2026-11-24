<?php

use App\Enums\Currency;
use App\Enums\MaintenanceMode;
use App\Models\KeyExchange;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\System\MaintenanceService;
use App\Services\Wallet\AllocationService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/** Give the player whole Keys (Super Admin adjustment, like the real flow). */
function shopKeys(User $p, int $keys): void
{
    app(AllocationService::class)->adjust(superAdmin(), app(WalletService::class)->for($p, Currency::KY), $keys * 100, 'test keys');
}

test('the Shop lists the four packages and your Keys and Gold', function () {
    $p = User::factory()->player()->create();
    shopKeys($p, 7);

    $this->actingAs($p, 'sanctum')->getJson('/api/v1/shop')->assertOk()
        ->assertJsonPath('data.packages', [['id' => 'k1', 'keys' => 1, 'gold' => 5], ['id' => 'k2', 'keys' => 2, 'gold' => 10], ['id' => 'k5', 'keys' => 5, 'gold' => 25], ['id' => 'k10', 'keys' => 10, 'gold' => 50]])
        ->assertJsonPath('data.balances.keys', '7.00')->assertJsonPath('data.balances.gold', '0.00');
});

test('exchanging takes the Keys and gives the Gold together, once per request, logged in the ledger and history', function () {
    $p = User::factory()->player()->create();
    shopKeys($p, 7);

    $body = ['package' => 'k5', 'idempotency_key' => 'shop-0001', 'confirmed' => true];
    $this->actingAs($p, 'sanctum')->postJson('/api/v1/shop/key-exchanges', $body)->assertCreated()
        ->assertJsonPath('data.balances.keys', '2.00')->assertJsonPath('data.balances.gold', '25.00');
    // Double tap / retry with the same key: nothing moves again.
    $this->actingAs($p, 'sanctum')->postJson('/api/v1/shop/key-exchanges', $body)->assertOk()->assertJsonPath('data.balances.keys', '2.00');

    expect(balance($p, Currency::KY))->toBe(200)->and(balance($p, Currency::GD))->toBe(2_500)
        ->and(WalletTransaction::query()->where('type', 'KEY_EXCHANGE')->count())->toBe(2)
        ->and(KeyExchange::query()->where('user_id', $p->id)->where('status', 'completed')->count())->toBe(1);
    $e = KeyExchange::query()->sole();
    expect([$e->package, $e->keys_amount, $e->gold_amount, $e->keysTransaction->currency->value, $e->goldTransaction->currency->value])->toBe(['k5', 500, 2_500, 'KY', 'GD']);
    $this->actingAs($p, 'sanctum')->getJson('/api/v1/shop')->assertJsonPath('data.history.0.gold', '25.00');
    $this->actingAs($p, 'sanctum')->getJson('/api/v1/wallet/transactions?currency=KY')->assertJsonPath('data.0.type', 'KEY_EXCHANGE');
});

test('not enough Keys: refused, nothing changes, the attempt is logged; confirmation and a valid package are required', function () {
    $p = User::factory()->player()->create();
    shopKeys($p, 4);

    $this->actingAs($p, 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k5', 'idempotency_key' => 'shop-0002', 'confirmed' => true])
        ->assertStatus(422)->assertJsonPath('error', 'insufficient_keys');
    $this->actingAs($p, 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k1', 'idempotency_key' => 'shop-0003'])->assertStatus(422)->assertJsonValidationErrors('confirmed');
    $this->actingAs($p, 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k3', 'idempotency_key' => 'shop-0004', 'confirmed' => true])->assertStatus(422)->assertJsonValidationErrors('package');

    expect(balance($p, Currency::KY))->toBe(400)->and(balance($p, Currency::GD))->toBe(0)
        ->and(KeyExchange::query()->where('status', 'rejected')->value('failure_reason'))->toBe('insufficient_keys')
        ->and(WalletTransaction::query()->where('type', 'KEY_EXCHANGE')->count())->toBe(0);

    // After getting Keys, the same request can go through.
    shopKeys($p, 1);
    $this->actingAs($p, 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k5', 'idempotency_key' => 'shop-0002', 'confirmed' => true])->assertCreated();
    expect(balance($p, Currency::KY))->toBe(0)->and(balance($p, Currency::GD))->toBe(2_500);
});

test('only players exchange, never during maintenance, and Gold cannot be exchanged back', function () {
    $agent = User::factory()->agent()->create();
    $this->actingAs($agent, 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k1', 'idempotency_key' => 'shop-0005', 'confirmed' => true])->assertForbidden();

    $p = User::factory()->player()->create();
    shopKeys($p, 3);
    app(MaintenanceService::class)->set(superAdmin(), MaintenanceMode::AgentsPlayers);
    $this->actingAs($p, 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k1', 'idempotency_key' => 'shop-0006', 'confirmed' => true])->assertStatus(503);
    expect(balance($p, Currency::KY))->toBe(300)->and(balance($p, Currency::GD))->toBe(0);

    // There is no Gold → Keys package.
    expect(collect(config('pusoy.shop.key_packages'))->every(fn ($pkg) => $pkg['keys'] > 0 && $pkg['gold'] > 0))->toBeTrue();
});
