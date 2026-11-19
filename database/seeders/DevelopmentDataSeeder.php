<?php

namespace Database\Seeders;

use App\Console\Commands\CreateSuperAdmin;
use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\Role;
use App\Models\User;
use App\Services\Users\UserManagementService;
use App\Services\Wallet\AllocationService;
use Illuminate\Database\Seeder;

/**
 * Local development accounts (password for all: "password").
 *
 *   superadmin            Super Admin
 *   admin                 Administrator (all abilities except audit logs)
 *   agent / agent2        Agents (agent owns player + demo1..demo6)
 *   player                Player owned by agent
 *   demo1..demo12         Players (demo7..demo12 owned by agent2)
 *
 * Balances follow the allocation workflow so the ledger stays consistent.
 */
class DevelopmentDataSeeder extends Seeder
{
    public function run(UserManagementService $users, AllocationService $allocations): void
    {
        if (User::query()->where('username', 'superadmin')->exists()) {
            return;
        }

        $make = fn (?User $actor, Role $role, string $username, string $name) => $users->create($actor, $role, [
            'name' => $name,
            'username' => $username,
            'email' => "{$username}@pusoy.test",
            'password' => 'password',
        ]);

        $super = CreateSuperAdmin::bootstrap('Super Admin', 'superadmin', 'superadmin@pusoy.test', 'password');

        $admin = $make($super, Role::Administrator, 'admin', 'Platform Admin');
        $users->syncPermissions($super, $admin, array_values(array_diff(
            array_map(fn (Ability $a) => $a->value, Ability::cases()),
            [Ability::ViewAuditLogs->value],
        )));

        $agent = $make($super, Role::Agent, 'agent', 'Agent Alpha');
        $agent2 = $make($super, Role::Agent, 'agent2', 'Agent Bravo');

        $allocations->allocate($super, $admin, Currency::CH, 500_000_00, 'Initial admin Chips allocation');
        $allocations->allocate($super, $agent, Currency::CH, 10_000_00, 'Initial agent Chips allocation');
        $allocations->allocate($super, $agent2, Currency::CH, 10_000_00, 'Initial agent Chips allocation');

        $players = [$make($agent, Role::Player, 'player', 'Pat Player')];

        foreach (range(1, 12) as $i) {
            $owner = $i <= 6 ? $agent : $agent2;
            $players[] = $make($owner, Role::Player, "demo{$i}", "Demo {$i}");
        }

        foreach ($players as $index => $player) {
            $owner = $index <= 6 ? $agent : $agent2;
            $allocations->allocate($owner, $player, Currency::CH, 1_000_00, 'Welcome Chips from agent', "seed-{$player->id}");
        }
    }
}
