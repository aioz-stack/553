<?php

use App\Enums\Currency;
use App\Enums\MaintenanceMode;
use App\Enums\WalletType;
use App\Models\KeyExchange;
use App\Models\KeyExchangeShare;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\System\MaintenanceService;
use App\Services\Users\ReferralService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/*
| Shop: buy Keys with Chips (5 Chips = 1 Key). The Chips paid are shared with the hierarchy by
| the player's direct upline, into Chips wallets:
|   Admin → Admin 100% · Incorporator → Admin 40 / Incorporator 60 · Master → Admin 40 / Inc 10 / Master 50
*/

/** Admin → Incorporator → Master Agent, plus one player under each (built through the links). */
function shopTree(): array
{
    $admin = superAdmin();
    $refs = app(ReferralService::class);
    $join = fn (string $code, string $type, string $u) => $refs->approve($admin, $refs->register(['name' => $u, 'username' => $u, 'email' => "{$u}@t.test", 'password' => 'secret123'], $code, $type));
    $inc = $join($refs->codeFor($admin), 'agent', 'shopinc');
    $master = $join($inc->referral_code, 'agent', 'shopmaster');
    $pMaster = $join($master->referral_code, 'player', 'pmasterx');
    $pInc = $join($inc->referral_code, 'player', 'pincx');
    // An older player registered straight under the Admin.
    $pAdmin = User::factory()->player()->create(['sponsor_id' => $admin->id, 'username' => 'padminx']);

    return compact('admin', 'inc', 'master', 'pMaster', 'pInc', 'pAdmin');
}

function shopChips(User $u): int
{
    return balance($u, Currency::CH, $u->isPlayer() ? WalletType::Player : WalletType::Allocation);
}

function shopBuy($test, User $p, string $package, string $key)
{
    return $test->actingAs($p, 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => $package, 'idempotency_key' => $key, 'confirmed' => true]);
}

test('the Shop sells Keys for Chips at 5 Chips = 1 Key', function () {
    $t = shopTree();
    fund($t['pMaster'], 7_000);

    $this->actingAs($t['pMaster'], 'sanctum')->getJson('/api/v1/shop')->assertOk()
        ->assertJsonPath('data.chips_per_key', 5)
        ->assertJsonPath('data.packages', [['id' => 'k1', 'chips' => 5, 'keys' => 1], ['id' => 'k2', 'chips' => 10, 'keys' => 2], ['id' => 'k5', 'chips' => 25, 'keys' => 5], ['id' => 'k10', 'chips' => 50, 'keys' => 10]])
        ->assertJsonPath('data.balances.chips', '70.00')->assertJsonPath('data.balances.keys', '0.00');
});

test('a player under a Master Agent: Chips out, Keys in, Admin 40% / Incorporator 10% / Master 50% into their Chips wallets — once', function () {
    $t = shopTree();
    fund($t['pMaster'], 7_000);
    $before = ['admin' => shopChips($t['admin']), 'inc' => shopChips($t['inc']), 'master' => shopChips($t['master'])];

    shopBuy($this, $t['pMaster'], 'k10', 'buy-0001')->assertCreated()
        ->assertJsonPath('data.balances.chips', '20.00')->assertJsonPath('data.balances.keys', '10.00')
        ->assertJsonPath('data.exchange.shares', [['role' => 'admin', 'percent' => 40], ['role' => 'incorporator', 'percent' => 10], ['role' => 'master', 'percent' => 50]]);
    // Double click / retry: nothing moves again.
    shopBuy($this, $t['pMaster'], 'k10', 'buy-0001')->assertOk()->assertJsonPath('data.balances.chips', '20.00');

    expect(shopChips($t['pMaster']))->toBe(2_000)->and(balance($t['pMaster'], Currency::KY))->toBe(1_000)
        ->and(shopChips($t['admin']) - $before['admin'])->toBe(2_000)   // 40% of 50
        ->and(shopChips($t['inc']) - $before['inc'])->toBe(500)          // 10%
        ->and(shopChips($t['master']) - $before['master'])->toBe(2_500)  // 50%
        // Never into a Keys wallet of the hierarchy.
        ->and(\App\Models\Wallet::query()->whereIn('user_id', [$t['admin']->id, $t['inc']->id, $t['master']->id])->where('currency', 'KY')->sum('balance'))->toBe(0);

    $e = KeyExchange::query()->sole();
    expect([$e->direction, $e->chips_amount, $e->keys_amount, $e->player_username, $e->upline_user_id, $e->scenario, $e->status])
        ->toBe(['chips_to_keys', 5_000, 1_000, 'pmasterx', $t['master']->id, 'master', 'completed'])
        ->and(collect($e->hierarchy)->pluck('username')->all())->toBe(['shopmaster', 'shopinc', $t['admin']->username])
        ->and($e->shares()->sum('amount'))->toBe(5_000)->and($e->shares()->sum('percent_bps'))->toBe(10_000);
    foreach ($e->shares as $s) {
        expect($s->wallet->currency)->toBe(Currency::CH)->and($s->wallet->user_id)->toBe($s->recipient_user_id)
            ->and($s->wallet_transaction_id)->not->toBeNull();
    }
    expect(WalletTransaction::query()->where('type', 'KEY_EXCHANGE')->count())->toBe(4) // 3 shares + the Keys
        ->and(\App\Models\AuditLog::query()->where('action', 'shop.chips_to_keys')->count())->toBe(1)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('a player under an Incorporator: Admin 40% / Incorporator 60%; a player under the Admin: Admin 100%', function () {
    $t = shopTree();
    fund($t['pInc'], 2_500);
    fund($t['pAdmin'], 1_000);
    $adminBefore = shopChips($t['admin']);
    $incBefore = shopChips($t['inc']);

    shopBuy($this, $t['pInc'], 'k5', 'buy-0002')->assertCreated()->assertJsonPath('data.exchange.shares', [['role' => 'admin', 'percent' => 40], ['role' => 'incorporator', 'percent' => 60]]);
    expect(shopChips($t['admin']) - $adminBefore)->toBe(1_000)->and(shopChips($t['inc']) - $incBefore)->toBe(1_500);

    shopBuy($this, $t['pAdmin'], 'k2', 'buy-0003')->assertCreated()->assertJsonPath('data.exchange.shares', [['role' => 'admin', 'percent' => 100]]);
    expect(shopChips($t['admin']) - $adminBefore)->toBe(1_000 + 1_000)
        ->and(balance($t['pAdmin'], Currency::KY))->toBe(200)->and(shopChips($t['pAdmin']))->toBe(0);
    expect(KeyExchange::query()->where('user_id', $t['pAdmin']->id)->value('scenario'))->toBe('admin');
});

test('not enough Chips: refused, nothing moves and nobody earns; confirmation and a valid package are required', function () {
    $t = shopTree();
    fund($t['pMaster'], 2_400);
    $adminBefore = shopChips($t['admin']);

    shopBuy($this, $t['pMaster'], 'k5', 'buy-0004')->assertStatus(422)->assertJsonPath('error', 'insufficient_chips');
    $this->actingAs($t['pMaster'], 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k1', 'idempotency_key' => 'buy-0005'])->assertStatus(422)->assertJsonValidationErrors('confirmed');
    $this->actingAs($t['pMaster'], 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k3', 'idempotency_key' => 'buy-0006', 'confirmed' => true])->assertStatus(422)->assertJsonValidationErrors('package');

    expect(shopChips($t['pMaster']))->toBe(2_400)->and(balance($t['pMaster'], Currency::KY))->toBe(0)
        ->and(shopChips($t['admin']))->toBe($adminBefore)
        ->and(KeyExchangeShare::query()->count())->toBe(0)
        ->and(KeyExchange::query()->where('status', 'rejected')->value('failure_reason'))->toBe('insufficient_chips')
        ->and(WalletTransaction::query()->where('type', 'KEY_EXCHANGE')->count())->toBe(0);
});

test('only players buy, never during maintenance; Keys are never turned back into Chips', function () {
    $t = shopTree();
    $this->actingAs($t['master'], 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k1', 'idempotency_key' => 'buy-0007', 'confirmed' => true])->assertForbidden();

    fund($t['pMaster'], 1_000);
    app(MaintenanceService::class)->set(superAdmin(), MaintenanceMode::AgentsPlayers);
    shopBuy($this, $t['pMaster'], 'k1', 'buy-0008')->assertStatus(503);
    expect(shopChips($t['pMaster']))->toBe(1_000)->and(KeyExchangeShare::query()->count())->toBe(0);

    // Every package costs exactly 5 Chips per Key, and there is no Keys → Chips package.
    expect(collect(\App\Services\Wallet\KeyExchangeService::packages())->every(fn ($p) => $p['chips'] === $p['keys'] * 5))->toBeTrue();
});

test('an Incorporator without a recorded sponsor still pays its Admin: the Admin who created it, else the Super Admin — never the platform', function () {
    $super = superAdmin();
    $admin = User::factory()->create(['role' => 'admin']);
    // Older accounts: no sponsor recorded; one created by the Administrator, one by nobody known.
    $incA = User::factory()->agent()->create(['sponsor_id' => null, 'created_by' => $admin->id]);
    $incB = User::factory()->agent()->create(['sponsor_id' => null, 'created_by' => null]);
    $incB->agent->forceFill(['created_by' => null])->save();
    $pA = User::factory()->player()->create(['sponsor_id' => $incA->id]);
    $pB = User::factory()->player()->create(['sponsor_id' => $incB->id]);
    \App\Models\AgentPlayer::query()->create(['player_id' => $pA->id, 'agent_id' => $incA->agent->id, 'assigned_at' => now()]);
    \App\Models\AgentPlayer::query()->create(['player_id' => $pB->id, 'agent_id' => $incB->agent->id, 'assigned_at' => now()]);
    fund($pA, 1_000);
    fund($pB, 1_000);
    $adminBefore = shopChips($admin);
    $superBefore = shopChips($super);

    shopBuy($this, $pA, 'k2', 'buy-0101')->assertCreated();
    shopBuy($this, $pB, 'k2', 'buy-0102')->assertCreated();

    expect(shopChips($admin) - $adminBefore)->toBe(400)           // 40% of 10 Chips, to the Administrator who created incA
        ->and(shopChips($super) - $superBefore)->toBe(400)        // incB has no Admin on record: the Super Admin
        ->and(KeyExchangeShare::query()->where('role', 'platform')->count())->toBe(0)
        ->and(KeyExchange::query()->where('user_id', $pB->id)->first()->hierarchy)->toContain(['role' => 'admin', 'user_id' => $super->id, 'username' => $super->username]);
});

test('pusoy:assign-admin puts an Incorporator under an Admin; its players then pay that Admin, and past shares can be moved', function () {
    $super = superAdmin();
    $admin = User::factory()->create(['role' => 'admin', 'username' => 'opsadmin']);
    $inc = User::factory()->agent()->create(['sponsor_id' => null, 'created_by' => $super->id, 'username' => 'oldinc']);
    $p = User::factory()->player()->create(['sponsor_id' => $inc->id]);
    \App\Models\AgentPlayer::query()->create(['player_id' => $p->id, 'agent_id' => $inc->agent->id, 'assigned_at' => now()]);
    fund($p, 2_000);

    shopBuy($this, $p, 'k2', 'buy-0201')->assertCreated(); // before: the Super Admin gets the 40%
    $superBefore = shopChips($super);
    $adminBefore = shopChips($admin);

    $this->artisan('pusoy:assign-admin', ['incorporator' => 'oldinc', 'admin' => 'opsadmin', '--move-shop-shares' => true])->assertSuccessful();
    $this->artisan('pusoy:assign-admin', ['incorporator' => 'oldinc', 'admin' => 'opsadmin', '--move-shop-shares' => true])->assertSuccessful(); // re-run: nothing twice

    expect($inc->fresh()->sponsor_id)->toBe($admin->id)
        ->and(shopChips($admin) - $adminBefore)->toBe(400)->and($superBefore - shopChips($super))->toBe(400)
        ->and(KeyExchangeShare::query()->where('role', 'admin')->value('recipient_user_id'))->toBe($admin->id);

    shopBuy($this, $p, 'k2', 'buy-0202')->assertCreated(); // after: straight to the Administrator
    expect(shopChips($admin) - $adminBefore)->toBe(800)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();

    $this->artisan('pusoy:assign-admin', ['incorporator' => 'opsadmin', 'admin' => 'oldinc'])->assertFailed();
});
