<?php

use App\Enums\Currency;
use App\Enums\MaintenanceMode;
use App\Enums\WalletType;
use App\Models\AuditLog;
use App\Models\RevenueConversion;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\System\MaintenanceService;
use App\Services\Users\ReferralService;
use App\Services\Wallet\WalletService;
use App\Services\Wallet\RevenueConversionService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/*
| Self Convert Revenue to Chips: Shop revenue shares collect in each upline account's Revenue
| wallet; the user converts an amount (minimum 20, at most the Available Revenue) into their own Chips.
*/

/** Admin → Incorporator → Master Agent → one player, and one Shop purchase of 10 Keys (50 Chips). */
function rvTree($test): array
{
    $admin = superAdmin();
    $refs = app(ReferralService::class);
    $join = fn (string $code, string $type, string $u) => $refs->approve($admin, $refs->register(['name' => $u, 'username' => $u, 'email' => "{$u}@t.test", 'password' => 'secret123'], $code, $type));
    $inc = $join($refs->codeFor($admin), 'agent', 'rvinc');
    $master = $join($inc->referral_code, 'agent', 'rvmaster');
    $player = $join($master->referral_code, 'player', 'rvplayer');
    fund($player, 10_000);
    $test->actingAs($player, 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k10', 'idempotency_key' => 'rv-buy-1', 'confirmed' => true])->assertSuccessful();

    return compact('admin', 'inc', 'master', 'player');
}

function rvChips(User $u): int
{
    return balance($u, Currency::CH, WalletType::Allocation);
}

function rvRevenue(User $u): int
{
    return balance($u, Currency::CH, WalletType::Share);
}

function rvConvert($test, User $u, string $amount, string $id)
{
    return $test->actingAs($u)->postJson('/api/v1/revenue/convert', ['amount' => $amount, 'request_id' => $id]);
}

test('Shop shares are paid into Revenue (not Chips); converting an amount moves it into Chips at 1:1', function () {
    $t = rvTree($this);
    // Master 50% of 50 Chips = 25.00; Incorporator 10% = 5.00; Admin 40% = 20.00.
    expect(rvRevenue($t['master']))->toBe(2_500)->and(rvRevenue($t['inc']))->toBe(500)->and(rvRevenue($t['admin']))->toBe(2_000);
    $chipsBefore = rvChips($t['master']);

    $summary = $this->actingAs($t['master'])->getJson('/api/v1/revenue')->assertOk()->json('data');
    expect($summary)->toMatchArray(['available_revenue' => '25.00', 'total_revenue' => '25.00', 'min_amount' => '20.00', 'rate' => '1 Revenue = 1 Chip', 'can_convert' => true]);

    $res = rvConvert($this, $t['master'], '20.50', 'conv-1')->assertOk();
    $res->assertJsonPath('data.conversion.revenue_converted', '20.50')->assertJsonPath('data.conversion.chips_credited', '20.50')
        ->assertJsonPath('data.summary.available_revenue', '4.50')->assertJsonPath('data.summary.can_convert', false)
        // Total Revenue is cumulative: a conversion never reduces it.
        ->assertJsonPath('data.summary.total_revenue', '25.00')->assertJsonPath('data.summary.converted_total', '20.50');
    expect($res->json('message'))->toContain('20.50')->toContain('Chips credited');

    expect(rvRevenue($t['master']))->toBe(450)->and(rvChips($t['master']))->toBe($chipsBefore + 2_050);

    // The record: account, role, amounts, rate, balances before / after, status, time.
    $c = RevenueConversion::query()->sole();
    expect($c->user_id)->toBe($t['master']->id)->and($c->role)->toBe('agent')->and($c->agent_level)->toBe('master')
        ->and($c->revenue_amount)->toBe(2_050)->and($c->rate_bps)->toBe(10_000)->and($c->chips_amount)->toBe(2_050)
        ->and($c->revenue_before)->toBe(2_500)->and($c->revenue_after)->toBe(450)
        ->and($c->chips_before)->toBe($chipsBefore)->and($c->chips_after)->toBe($chipsBefore + 2_050)
        ->and($c->status)->toBe('completed')->and($c->reference)->toStartWith('RV')->and($c->created_at)->not->toBeNull()
        ->and(WalletTransaction::query()->whereKey($c->wallet_transaction_id)->value('type'))->not->toBeNull()
        ->and(AuditLog::query()->where('action', 'revenue.converted')->count())->toBe(1);

    // The other accounts' Revenue is untouched; the ledger still reconciles.
    expect(rvRevenue($t['inc']))->toBe(500)->and(rvRevenue($t['admin']))->toBe(2_000);
    expect(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('minimum 20, at most the Available Revenue, a valid number: otherwise refused and nothing moves', function () {
    $t = rvTree($this);
    $chips = rvChips($t['master']);

    rvConvert($this, $t['master'], '19.99', 'v1')->assertStatus(422)->assertJsonPath('error', 'below_minimum');
    rvConvert($this, $t['master'], '25.01', 'v2')->assertStatus(422)->assertJsonPath('error', 'insufficient_revenue');
    foreach (['abc', '-20', '20.555', '', '1e3'] as $i => $bad) {
        rvConvert($this, $t['master'], $bad, "bad{$i}")->assertStatus(422)->assertJsonValidationErrors('amount');
    }
    $this->actingAs($t['master'])->postJson('/api/v1/revenue/convert', ['amount' => '20'])->assertStatus(422)->assertJsonValidationErrors('request_id');
    // The Incorporator has 5.00: below the minimum, so it cannot convert at all.
    $this->actingAs($t['inc'])->getJson('/api/v1/revenue')->assertJsonPath('data.can_convert', false);
    rvConvert($this, $t['inc'], '5', 'v3')->assertStatus(422)->assertJsonPath('error', 'below_minimum');

    expect(rvChips($t['master']))->toBe($chips)->and(rvRevenue($t['master']))->toBe(2_500)->and(RevenueConversion::query()->count())->toBe(0);

    // Exactly the minimum and exactly the whole balance are both allowed.
    rvConvert($this, $t['admin'], '20', 'v4')->assertOk()->assertJsonPath('data.conversion.revenue_converted', '20.00');
    rvConvert($this, $t['master'], '25.00', 'v5')->assertOk();
    expect(rvRevenue($t['admin']))->toBe(0)->and(rvRevenue($t['master']))->toBe(0);
});

test('each role converts only its own Revenue: Admin and Master Agent', function () {
    $t = rvTree($this);
    foreach (['admin' => 2_000, 'master' => 2_500] as $who => $amount) {
        $before = rvChips($t[$who]);
        rvConvert($this, $t[$who], number_format($amount / 100, 2, '.', ''), "own-{$who}")->assertOk();
        expect(rvChips($t[$who]) - $before)->toBe($amount)->and(rvRevenue($t[$who]))->toBe(0);
    }
    // Nobody else's Revenue moved.
    expect(rvRevenue($t['inc']))->toBe(500)
        ->and(RevenueConversion::query()->pluck('user_id')->sort()->values()->all())->toBe(collect([$t['admin']->id, $t['master']->id])->sort()->values()->all());
});

test('double clicks never pay twice; Total Revenue never drops; each account sees its own figures', function () {
    $t = rvTree($this);
    rvConvert($this, $t['master'], '25', 'a1')->assertOk();
    $chips = rvChips($t['master']);

    // A double click (same request id) returns the first conversion; nothing more is credited.
    rvConvert($this, $t['master'], '25', 'a1')->assertOk()->assertJsonPath('data.conversion.revenue_converted', '25.00');
    // A new request with nothing left is refused.
    rvConvert($this, $t['master'], '20', 'a2')->assertStatus(422)->assertJsonPath('error', 'insufficient_revenue');
    expect(rvChips($t['master']))->toBe($chips)->and(RevenueConversion::query()->count())->toBe(1);

    // New revenue later can be converted (only that new amount).
    fund($t['player'], 10_000);
    $this->actingAs($t['player'], 'sanctum')->postJson('/api/v1/shop/key-exchanges', ['package' => 'k10', 'idempotency_key' => 'rv-buy-2', 'confirmed' => true])->assertSuccessful();
    rvConvert($this, $t['master'], '25', 'a3')->assertOk();
    expect(rvChips($t['master']))->toBe($chips + 2_500);
    $this->actingAs($t['master'])->getJson('/api/v1/revenue')->assertJsonPath('data.total_revenue', '50.00')
        ->assertJsonPath('data.available_revenue', '0.00')->assertJsonPath('data.converted_total', '50.00');

    // The Incorporator's figures are its own 10% shares, not the Admin's.
    $this->actingAs($t['inc'])->getJson('/api/v1/revenue')->assertJsonPath('data.total_revenue', '10.00')->assertJsonPath('data.available_revenue', '10.00');
    $this->actingAs($t['admin'])->getJson('/api/v1/revenue')->assertJsonPath('data.total_revenue', '40.00')->assertJsonPath('data.available_revenue', '40.00');
});

test('players, Loader Accounts and guests cannot convert; nothing during maintenance', function () {
    $t = rvTree($this);
    rvConvert($this, $t['player'], '20', 'p1')->assertForbidden();
    $this->actingAs($t['player'])->getJson('/api/v1/revenue')->assertForbidden();
    $loader = User::factory()->create(['role' => \App\Enums\Role::Loader]);
    rvConvert($this, $loader, '20', 'l1')->assertForbidden();
    \Illuminate\Support\Facades\Auth::forgetGuards();
    $this->postJson('/api/v1/revenue/convert', ['amount' => '20', 'request_id' => 'g1'])->assertUnauthorized();

    app(MaintenanceService::class)->set($t['admin'], MaintenanceMode::AgentsPlayers);
    rvConvert($this, $t['master'], '20', 'm1')->assertStatus(503);
    expect(rvRevenue($t['master']))->toBe(2_500)->and(RevenueConversion::query()->count())->toBe(0);
});

test('a configured rate other than 1:1 is applied on the server and the ledger stays reconciled', function () {
    config(['pusoy.revenue_conversion.rate_bps' => 15_000]); // 1 Revenue = 1.5 Chips
    $t = rvTree($this);
    $before = rvChips($t['master']);
    $this->actingAs($t['master'])->getJson('/api/v1/revenue')->assertJsonPath('data.rate', '1 Revenue = 1.5 Chips');
    rvConvert($this, $t['master'], '25', 'r1')->assertOk()->assertJsonPath('data.conversion.chips_credited', '37.50');
    expect(rvChips($t['master']) - $before)->toBe(3_750)->and(rvRevenue($t['master']))->toBe(0)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('a failure while converting rolls everything back', function () {
    $t = rvTree($this);
    $chips = rvChips($t['master']);
    // Break the record insert after the ledger moves: the whole transaction rolls back.
    RevenueConversion::creating(fn () => throw new RuntimeException('boom'));
    expect(fn () => app(RevenueConversionService::class)->convert($t['master']->fresh(), 2_000, 'x1'))->toThrow(RuntimeException::class);
    RevenueConversion::flushEventListeners();
    expect(rvRevenue($t['master']))->toBe(2_500)->and(rvChips($t['master']))->toBe($chips)
        ->and(RevenueConversion::query()->count())->toBe(0)
        ->and(WalletTransaction::query()->where('type', 'REVENUE_CONVERSION')->count())->toBe(0);
});
