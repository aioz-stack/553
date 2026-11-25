<?php

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\WalletType;
use App\Models\AgentCommissionRule;
use App\Models\AuditLog;
use App\Models\KeyExchangeShare;
use App\Models\Permission;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\Users\ReferralService;
use App\Services\Wallet\ShopRevenueShares;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/*
| Commission / revenue-sharing rates are managed only by the Administrator (Super Admin, or an
| Administrator with manage_commissions). Incorporators and Master Agents can never change them.
*/

/** Super Admin → Incorporator → Master Agent → player. */
function ssTree(): array
{
    $super = superAdmin();
    $refs = app(ReferralService::class);
    $join = fn (string $code, string $type, string $u) => $refs->approve($super, $refs->register(['name' => $u, 'username' => $u, 'email' => "{$u}@t.test", 'password' => 'secret123'], $code, $type));
    $inc = $join($refs->codeFor($super), 'agent', 'ssinc');
    $master = $join($inc->referral_code, 'agent', 'ssmaster');
    $player = $join($master->referral_code, 'player', 'ssplayer');

    return compact('super', 'inc', 'master', 'player');
}

function ssRates(array $master = ['admin' => 30, 'incorporator' => 20, 'master' => 50]): array
{
    return ['rates' => ['admin' => ['admin' => 100], 'incorporator' => ['admin' => 35, 'incorporator' => 65], 'master' => $master]];
}

test('the Administrator saves revenue-sharing rates; they apply to future key purchases only', function () {
    $t = ssTree();
    fund($t['player'], 20_000);
    $buy = fn (string $key) => $this->actingAs($t['player'], 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k10', 'idempotency_key' => $key, 'confirmed' => true])->assertSuccessful();

    // Defaults (config) before any change: Master 50 / Incorporator 10 / Admin 40.
    $this->actingAs($t['super'])->getJson('/api/v1/admin/panel/shop-shares')->assertOk()
        ->assertJsonPath('data.is_default', true)->assertJsonPath('data.can_edit', true)->assertJsonPath('data.rates.master.incorporator', 10);
    $buy('buy-before');
    $before = KeyExchangeShare::query()->pluck('amount', 'role')->all();
    expect($before)->toBe(['admin' => 2_000, 'incorporator' => 500, 'master' => 2_500]);

    $this->actingAs($t['super'])->putJson('/api/v1/admin/panel/shop-shares', ssRates())->assertOk()
        ->assertJsonPath('data.rates.master.admin', 30)->assertJsonPath('data.rates.master.incorporator', 20)->assertJsonPath('data.is_default', false);
    expect(AuditLog::query()->where('action', 'shop.revenue_shares')->count())->toBe(1);

    // The next purchase uses the new rates; the first purchase's shares are unchanged.
    $buy('buy-after1');
    $after = KeyExchangeShare::query()->where('id', '>', KeyExchangeShare::query()->max('id') - 3)->get()->pluck('amount', 'role')->all();
    expect($after)->toBe(['admin' => 1_500, 'incorporator' => 1_000, 'master' => 2_500])
        ->and(KeyExchangeShare::query()->orderBy('id')->limit(3)->pluck('amount', 'role')->all())->toBe($before)
        ->and(balance($t['inc'], Currency::CH, WalletType::Share))->toBe(500 + 1_000);
});

test('every scenario must total exactly 100% with valid rates; otherwise nothing is saved', function () {
    $t = ssTree();
    $put = fn (array $body) => $this->actingAs($t['super'])->putJson('/api/v1/admin/panel/shop-shares', $body);

    $put(ssRates(['admin' => 40, 'incorporator' => 10, 'master' => 40]))->assertStatus(422)->assertJsonPath('error', 'invalid_total');
    $put(ssRates(['admin' => 40, 'incorporator' => 10, 'master' => 50.555]))->assertStatus(422);
    $put(ssRates(['admin' => -10, 'incorporator' => 60, 'master' => 50]))->assertStatus(422);
    $put(ssRates(['admin' => 40, 'master' => 60]))->assertStatus(422)->assertJsonPath('error', 'invalid_rate');
    $put(['rates' => ['master' => ['admin' => 40, 'incorporator' => 10, 'master' => 50]]])->assertStatus(422);
    $put(ssRates(['admin' => 40, 'incorporator' => 10, 'master' => 50, 'player' => 0]))->assertStatus(422);
    expect(SystemSetting::query()->where('key', ShopRevenueShares::KEY)->exists())->toBeFalse();

    // Decimals are fine as long as the total is 100%.
    $put(ssRates(['admin' => 33.33, 'incorporator' => 16.67, 'master' => 50]))->assertOk()->assertJsonPath('data.rates.master.admin', 33.33);
});

test('Incorporators, Master Agents, players and Loader Accounts can never change any rate', function () {
    $t = ssTree();
    $loader = User::factory()->create(['role' => Role::Loader]);
    foreach ([$t['inc'], $t['master'], $t['player'], $loader] as $u) {
        $this->actingAs($u)->putJson('/api/v1/admin/panel/shop-shares', ssRates())->assertForbidden();
        $this->actingAs($u)->getJson('/api/v1/admin/panel/shop-shares')->assertForbidden();
        $this->actingAs($u)->putJson('/api/v1/admin/panel/commission-rates', ['agent' => 90, 'master' => 90])->assertForbidden();
        $this->actingAs($u)->putJson("/api/v1/admin/panel/accounts/{$t['master']->id}/commission-rate", ['rate' => 99])->assertForbidden();
        $this->actingAs($u)->postJson('/api/v1/admin/commission-rules', ['agent_id' => $t['master']->agent->id, 'rate_bps' => 9000])->assertForbidden();
    }
    // Even calling the service directly is refused.
    expect(fn () => app(ShopRevenueShares::class)->set($t['inc'], ssRates()['rates']))->toThrow(\App\Exceptions\BusinessRuleException::class);

    expect(SystemSetting::query()->where('key', ShopRevenueShares::KEY)->exists())->toBeFalse()
        ->and(AgentCommissionRule::query()->where('rate_bps', 9000)->orWhere('rate_bps', 9900)->exists())->toBeFalse();
});

test('an Administrator needs manage_commissions to save rates; without it the rates are read-only', function () {
    ssTree();
    $admin = User::factory()->create(['role' => Role::Administrator]);
    $this->actingAs($admin)->getJson('/api/v1/admin/panel/shop-shares')->assertOk()->assertJsonPath('data.can_edit', false);
    $this->actingAs($admin)->putJson('/api/v1/admin/panel/shop-shares', ssRates())->assertForbidden();
    $this->actingAs($admin)->putJson('/api/v1/admin/panel/commission-rates', ['agent' => 50, 'master' => 40])->assertForbidden();

    $admin->permissions()->attach(Permission::query()->where('key', Ability::ManageCommissions->value)->pluck('id'));
    $admin = $admin->fresh();
    $this->actingAs($admin)->getJson('/api/v1/admin/panel/shop-shares')->assertJsonPath('data.can_edit', true);
    $this->actingAs($admin)->putJson('/api/v1/admin/panel/shop-shares', ssRates())->assertOk();
    $this->actingAs($admin)->putJson('/api/v1/admin/panel/commission-rates', ['agent' => 50, 'master' => 40])->assertOk();
});
