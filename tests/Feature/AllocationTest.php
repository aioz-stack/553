<?php

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientBalanceException;
use App\Models\AdministratorLimit;
use App\Models\User;
use App\Models\WalletAllocation;
use App\Services\Users\UserManagementService;
use App\Services\Wallet\AllocationService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->allocations = app(AllocationService::class);
    $this->users = app(UserManagementService::class);
});

function agentWithPlayers(int $count = 3): array
{
    $agent = User::factory()->agent()->create();
    $players = [];

    foreach (range(1, $count) as $i) {
        $players[] = app(UserManagementService::class)->create($agent, Role::Player, [
            'name' => "P{$i}", 'username' => 'p'.$i.uniqid(), 'email' => uniqid().'@t.test', 'password' => 'password',
        ]);
    }

    return [$agent, $players];
}

test('the spec allocation example: 10,000 VC to an agent, distributed to three players', function () {
    $super = superAdmin();
    [$agent, [$p1, $p2, $p3]] = agentWithPlayers();

    $this->allocations->allocate($super, $agent, Currency::VC, 10_000_00);
    $this->allocations->allocate($agent, $p1, Currency::VC, 2_000_00);
    $this->allocations->allocate($agent, $p2, Currency::VC, 1_000_00);
    $this->allocations->allocate($agent, $p3, Currency::VC, 500_00);

    expect(balance($agent, Currency::VC, WalletType::Allocation))->toBe(6_500_00)
        ->and(balance($p1))->toBe(2_000_00)
        ->and(balance($p2))->toBe(1_000_00)
        ->and(balance($p3))->toBe(500_00)
        ->and(WalletAllocation::query()->count())->toBe(4);
});

test('agents cannot distribute more than their available allocation', function () {
    [$agent, [$p1]] = agentWithPlayers(1);
    $this->allocations->allocate(superAdmin(), $agent, Currency::VC, 100_00);

    expect(fn () => $this->allocations->allocate($agent, $p1, Currency::VC, 100_01))->toThrow(InsufficientBalanceException::class);
    expect(balance($agent, Currency::VC, WalletType::Allocation))->toBe(100_00);
});

test('agents cannot allocate to players they do not own', function () {
    [$agentA] = agentWithPlayers(0);
    [, [$foreignPlayer]] = agentWithPlayers(1);
    $this->allocations->allocate(superAdmin(), $agentA, Currency::VC, 1_000_00);

    expect(fn () => $this->allocations->allocate($agentA, $foreignPlayer, Currency::VC, 10_00))
        ->toThrow(BusinessRuleException::class, 'own registered players');
});

test('players can never credit themselves or anyone', function () {
    $player = User::factory()->create();
    $other = User::factory()->create();

    expect(fn () => $this->allocations->allocate($player, $other, Currency::VC, 100))->toThrow(BusinessRuleException::class)
        ->and(fn () => $this->allocations->allocate($player, $player, Currency::VC, 100))->toThrow(BusinessRuleException::class);
});

test('agents cannot top up their own allocation', function () {
    [$agent] = agentWithPlayers(0);

    expect(fn () => $this->allocations->allocate($agent, $agent, Currency::VC, 100))->toThrow(BusinessRuleException::class);
});

test('administrators need the allocate ability and respect their limits', function () {
    $super = superAdmin();
    $admin = User::factory()->administrator()->create();
    [$agent] = agentWithPlayers(0);

    expect(fn () => $this->allocations->allocate($admin, $agent, Currency::VC, 100))->toThrow(BusinessRuleException::class, 'not allowed');

    $this->users->syncPermissions($super, $admin, [Ability::AllocatePoints->value]);
    $admin->refresh();
    $this->allocations->allocate($super, $admin, Currency::VC, 1_000_00);
    AdministratorLimit::create(['user_id' => $admin->id, 'currency' => 'VC', 'max_per_transaction' => 300_00, 'daily_limit' => 500_00]);

    $this->allocations->allocate($admin, $agent, Currency::VC, 300_00);
    expect(fn () => $this->allocations->allocate($admin, $agent, Currency::VC, 300_01))->toThrow(BusinessRuleException::class, 'per-transaction');
    $this->allocations->allocate($admin, $agent, Currency::VC, 200_00);
    expect(fn () => $this->allocations->allocate($admin, $agent, Currency::VC, 1_00))->toThrow(BusinessRuleException::class, 'daily');

    expect(balance($admin, Currency::VC, WalletType::Allocation))->toBe(500_00)
        ->and(balance($agent, Currency::VC, WalletType::Allocation))->toBe(500_00);
});

test('duplicate allocation requests with the same idempotency key are applied once', function () {
    $super = superAdmin();
    [$agent] = agentWithPlayers(0);

    $this->allocations->allocate($super, $agent, Currency::VC, 100_00, null, 'abc');
    $this->allocations->allocate($super, $agent, Currency::VC, 100_00, null, 'abc');

    expect(balance($agent, Currency::VC, WalletType::Allocation))->toBe(100_00)
        ->and(WalletAllocation::query()->count())->toBe(1);
});

test('only super admins make manual adjustments and debits cannot go negative', function () {
    $super = superAdmin();
    $player = User::factory()->create();
    $wallet = app(WalletService::class)->for($player, Currency::VC);

    $this->allocations->adjust($super, $wallet, 500, 'Goodwill credit');
    expect(balance($player))->toBe(500);

    expect(fn () => $this->allocations->adjust($super, $wallet, -501, 'Too much'))->toThrow(InsufficientBalanceException::class);
    expect(fn () => $this->allocations->adjust(User::factory()->administrator()->create(), $wallet, 100, 'Nope'))->toThrow(BusinessRuleException::class);
});

test('frozen agent allocations cannot be distributed', function () {
    $super = superAdmin();
    [$agent, [$p1]] = agentWithPlayers(1);
    $this->allocations->allocate($super, $agent, Currency::VC, 100_00);

    $this->allocations->setFrozen($super, app(WalletService::class)->for($agent, Currency::VC, WalletType::Allocation), true);

    expect(fn () => $this->allocations->allocate($agent->fresh(), $p1, Currency::VC, 1_00))->toThrow(BusinessRuleException::class, 'frozen');
});
