<?php

use App\Enums\Role;
use App\Models\KeyExchange;
use App\Models\RevenueConversion;
use App\Models\User;
use App\Services\Users\ReferralService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/*
| Revenue Logs (completed Shop Buy-Ins) and Revenue Commission Withdrawal (completed Self Convert
| Revenue to Chips): read-only histories. Admin Panel = whole platform; Agent Panel = own downline.
*/

/** Admin → incA → masterA → playerA, and a separate Incorporator incB → playerB. */
function rhTree($test): array
{
    $admin = superAdmin();
    $refs = app(ReferralService::class);
    $join = fn (string $code, string $type, string $u) => $refs->approve($admin, $refs->register(['name' => $u, 'username' => $u, 'email' => "{$u}@t.test", 'password' => 'secret123'], $code, $type));
    $incA = $join($refs->codeFor($admin), 'agent', 'rhinca');
    $masterA = $join($incA->referral_code, 'agent', 'rhmastera');
    $playerA = $join($masterA->referral_code, 'player', 'rhplayera');
    $incB = $join($refs->codeFor($admin), 'agent', 'rhincb');
    $playerB = $join($incB->referral_code, 'player', 'rhplayerb');

    // Each player is funded exactly what it spends (playerB then has 0 Chips left).
    foreach ([[$playerA, 'k10', 'rh-buy-a1', 5_000], [$playerA, 'k2', 'rh-buy-a2', 1_000], [$playerB, 'k10', 'rh-buy-b1', 5_000]] as [$p, $pkg, $key, $chips]) {
        fund($p, $chips);
        $test->actingAs($p, 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => $pkg, 'idempotency_key' => $key, 'confirmed' => true])->assertSuccessful();
    }

    return compact('admin', 'incA', 'masterA', 'playerA', 'incB', 'playerB');
}

test('Revenue Logs list only completed Shop Buy-Ins, with player, upline, amount, keys, status and method', function () {
    $t = rhTree($this);
    // A refused attempt (not enough Chips) is logged as rejected and must not appear.
    $this->actingAs($t['playerB'], 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k10', 'idempotency_key' => 'rh-b-fail', 'confirmed' => true])->assertStatus(422);
    expect(KeyExchange::query()->where('status', KeyExchange::REJECTED)->count())->toBe(1);
    // A self-conversion must not appear in Revenue Logs either.
    $this->actingAs($t['masterA'])->postJson('/api/v1/revenue/convert', ['amount' => '25', 'request_id' => 'rh-conv-1'])->assertOk();

    $res = $this->actingAs($t['admin'])->getJson('/api/v1/admin/panel/revenue-logs')->assertOk();
    $res->assertJsonPath('meta.total', 3)->assertJsonPath('meta.summary.total_buy_in', '110.00')->assertJsonPath('meta.summary.total_keys', '22.00');
    $first = collect($res->json('data'))->firstWhere('player.username', 'rhplayerb');
    expect($first)->toMatchArray(['buy_in' => '50.00', 'keys' => '10.00', 'payment_method' => 'Chips', 'status' => 'completed'])
        ->and($first['player']['id'])->toBe($t['playerB']->id)
        ->and($first['transaction_id'])->toStartWith('SB')
        ->and(collect($first['upline'])->pluck('username')->all())->toBe(['rhincb', $t['admin']->username])
        ->and($first)->not->toHaveKey('percent');

    $a = collect($res->json('data'))->firstWhere('buy_in', '10.00');
    expect(collect($a['upline'])->pluck('role')->all())->toBe(['Master Agent', 'Incorporator', 'Admin']);
});

test('Revenue Logs: search, date and status filters, sorting and pagination', function () {
    $t = rhTree($this);
    $get = fn (array $q) => $this->actingAs($t['admin'])->getJson('/api/v1/admin/panel/revenue-logs?'.http_build_query($q))->assertOk();

    expect($get(['q' => 'rhplayera'])->json('meta.total'))->toBe(2)
        ->and($get(['q' => 'rhincb'])->json('meta.total'))->toBe(1)
        ->and($get(['q' => (string) $t['playerB']->id])->json('meta.total'))->toBe(1)
        ->and($get(['status' => 'completed'])->json('meta.total'))->toBe(3)
        ->and($get(['from' => now()->addDay()->toDateString()])->json('meta.total'))->toBe(0)
        ->and($get(['from' => now()->subDay()->toDateString(), 'to' => now()->addDay()->toDateString()])->json('meta.total'))->toBe(3)
        ->and($get(['sort' => 'amount_asc'])->json('data.0.buy_in'))->toBe('10.00')
        ->and($get(['sort' => 'amount_desc'])->json('data.0.buy_in'))->toBe('50.00');
    $paged = $get(['per_page' => 5, 'page' => 1]);
    expect($paged->json('meta.last_page'))->toBe(1);
    $this->actingAs($t['admin'])->getJson('/api/v1/admin/panel/revenue-logs?status=rejected')->assertStatus(422);
    $this->actingAs($t['admin'])->getJson('/api/v1/admin/panel/revenue-logs?from=2026-12-01&to=2026-11-01')->assertStatus(422);
});

test('each panel sees only its own hierarchy: Incorporator and Master Agent downlines', function () {
    $t = rhTree($this);
    $names = fn (User $u) => collect($this->actingAs($u)->getJson('/api/v1/agent/panel/revenue-logs')->assertOk()->json('data'))->pluck('player.username')->unique()->values()->all();

    expect($names($t['incA']))->toBe(['rhplayera'])
        ->and($names($t['masterA']))->toBe(['rhplayera'])
        ->and($names($t['incB']))->toBe(['rhplayerb']);
    // Not even by searching for the other branch's player or by ID.
    $this->actingAs($t['incA'])->getJson('/api/v1/agent/panel/revenue-logs?q=rhplayerb')->assertJsonPath('meta.total', 0);
    $this->actingAs($t['incA'])->getJson('/api/v1/agent/panel/revenue-logs?q='.$t['playerB']->id)->assertJsonPath('meta.total', 0);
    // Agents cannot use the Admin Panel endpoints; players reach neither.
    $this->actingAs($t['incA'])->getJson('/api/v1/admin/panel/revenue-logs')->assertForbidden();
    $this->actingAs($t['incA'])->getJson('/api/v1/admin/panel/revenue-conversions')->assertForbidden();
    $this->actingAs($t['playerA'])->getJson('/api/v1/agent/panel/revenue-logs')->assertForbidden();
    $this->actingAs($t['playerA'])->getJson('/api/v1/admin/panel/revenue-conversions')->assertForbidden();
});

test('Revenue Commission Withdrawal lists only completed self-conversions, by role and hierarchy', function () {
    $t = rhTree($this);
    // Revenue: masterA 25 + 5, incA 5 + 1, incB 30, Admin 20 + 4 + 20.
    $this->actingAs($t['masterA'])->postJson('/api/v1/revenue/convert', ['amount' => '30', 'request_id' => 'rh-m'])->assertOk();
    $this->actingAs($t['incB'])->postJson('/api/v1/revenue/convert', ['amount' => '20', 'request_id' => 'rh-b'])->assertOk();
    $this->actingAs($t['admin'])->postJson('/api/v1/revenue/convert', ['amount' => '44', 'request_id' => 'rh-a'])->assertOk();
    // A refused attempt leaves no record.
    $this->actingAs($t['incA'])->postJson('/api/v1/revenue/convert', ['amount' => '20', 'request_id' => 'rh-i'])->assertStatus(422);

    $res = $this->actingAs($t['admin'])->getJson('/api/v1/admin/panel/revenue-conversions')->assertOk()
        ->assertJsonPath('meta.total', 3)->assertJsonPath('meta.summary.total_converted', '94.00');
    $row = collect($res->json('data'))->firstWhere('account.username', 'rhmastera');
    $c = RevenueConversion::query()->where('user_id', $t['masterA']->id)->sole();
    expect($row)->toMatchArray(['transaction_id' => $c->reference, 'revenue_converted' => '30.00', 'status' => 'completed'])
        ->and($row['account'])->toBe(['id' => $t['masterA']->id, 'username' => 'rhmastera', 'role' => 'Master Agent'])
        ->and($row['reference'])->toStartWith('TX');

    $role = fn (string $r) => collect($this->actingAs($t['admin'])->getJson("/api/v1/admin/panel/revenue-conversions?role={$r}")->json('data'))->pluck('account.username')->all();
    expect($role('admin'))->toBe([$t['admin']->username])->and($role('incorporator'))->toBe(['rhincb'])->and($role('master'))->toBe(['rhmastera']);
    expect($this->actingAs($t['admin'])->getJson('/api/v1/admin/panel/revenue-conversions?sort=amount_asc')->json('data.0.revenue_converted'))->toBe('20.00');
    expect($this->actingAs($t['admin'])->getJson('/api/v1/admin/panel/revenue-conversions?q='.$c->reference)->json('meta.total'))->toBe(1);

    // Agents: themselves and the agents below them only.
    $agent = fn (User $u) => collect($this->actingAs($u)->getJson('/api/v1/agent/panel/revenue-conversions')->assertOk()->json('data'))->pluck('account.username')->all();
    expect($agent($t['incA']))->toBe(['rhmastera'])
        ->and($agent($t['masterA']))->toBe(['rhmastera'])
        ->and($agent($t['incB']))->toBe(['rhincb']);
});

test('the pages exist in every panel, read-only, and the removed pages are gone', function () {
    $t = rhTree($this);
    foreach (['/admin/revenue-logs', '/admin/revenue-withdrawals'] as $url) {
        $this->actingAs($t['admin'])->get($url)->assertOk();
    }
    foreach ([$t['incA'], $t['masterA']] as $u) {
        $this->actingAs($u)->get('/agent/revenue-logs')->assertOk();
        $this->actingAs($u)->get('/agent/revenue-withdrawals')->assertOk();
        $this->actingAs($u)->get('/admin/revenue-rates')->assertForbidden();
    }
    foreach (['/admin/commission-logs', '/admin/commission-withdrawals'] as $url) {
        $this->actingAs($t['admin'])->get($url)->assertNotFound();
    }
    // History only: no write routes exist for these sections.
    foreach (['revenue-logs', 'revenue-conversions'] as $path) {
        $this->actingAs($t['admin'])->postJson("/api/v1/admin/panel/{$path}")->assertStatus(405);
        $this->actingAs($t['admin'])->deleteJson("/api/v1/admin/panel/{$path}")->assertStatus(405);
    }
    $admin = User::factory()->create(['role' => Role::Administrator]);
    $this->actingAs($admin)->getJson('/api/v1/admin/panel/revenue-logs')->assertOk();
});
