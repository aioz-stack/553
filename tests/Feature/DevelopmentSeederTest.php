<?php

use App\Console\Commands\CreateSuperAdmin;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\WalletType;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Users\UserManagementService;
use App\Services\Wallet\WalletService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function seededBalances(): array
{
    $u = fn (string $name) => User::query()->where('username', $name)->firstOrFail();

    return [
        'super' => balance($u('superadmin'), Currency::CH, WalletType::Allocation),
        'admin' => balance($u('admin'), Currency::CH, WalletType::Allocation),
        'agent' => balance($u('agent'), Currency::CH, WalletType::Allocation),
        'agent2' => balance($u('agent2'), Currency::CH, WalletType::Allocation),
        'player' => balance($u('player'), Currency::CH),
        'demo12' => balance($u('demo12'), Currency::CH),
    ];
}

test('db:seed works on a fresh database: the Super Admin issues a Chips float and loads it down the hierarchy', function () {
    $this->seed(DatabaseSeeder::class);

    expect(seededBalances())->toBe([
        'super' => 480_000_00, // 1,000,000 issued − 500,000 admin − 2 × 10,000 agents
        'admin' => 500_000_00,
        'agent' => 3_000_00,   // 10,000 − 7 × 1,000 welcome Chips
        'agent2' => 4_000_00,  // 10,000 − 6 × 1,000
        'player' => 1_000_00,
        'demo12' => 1_000_00,
    ])->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('db:seed can run again: nothing is created or moved twice', function () {
    $this->seed(DatabaseSeeder::class);
    $users = User::query()->count();
    $transactions = WalletTransaction::query()->count();
    $balances = seededBalances();

    $this->seed(DatabaseSeeder::class);

    expect(User::query()->count())->toBe($users)
        ->and(WalletTransaction::query()->count())->toBe($transactions)
        ->and(seededBalances())->toBe($balances);
});

test('db:seed finishes a half-seeded database (accounts created, no Chips or players yet)', function () {
    // What an interrupted run leaves behind: the first accounts exist, nothing else.
    $super = CreateSuperAdmin::bootstrap('Super Admin', 'superadmin', 'superadmin@pusoy.test', 'password');
    $users = app(UserManagementService::class);
    foreach ([['admin', Role::Administrator], ['agent', Role::Agent], ['agent2', Role::Agent]] as [$name, $role]) {
        $users->create($super, $role, ['name' => $name, 'username' => $name, 'email' => "{$name}@pusoy.test", 'password' => 'password']);
    }

    $this->seed(DatabaseSeeder::class);

    expect(seededBalances()['player'])->toBe(1_000_00)
        ->and(User::query()->where('username', 'superadmin')->count())->toBe(1)
        ->and(User::query()->where('username', 'like', 'demo%')->count())->toBe(12)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});
