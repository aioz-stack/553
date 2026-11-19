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
 * Chips follow the real workflow (Super Admin issues a float, then loads it down the
 * hierarchy) so the ledger stays consistent.
 */
class DevelopmentDataSeeder extends Seeder
{
    /**
     * Resumable: every account is created only if it is missing and every Chips movement has a
     * fixed idempotency key, so re-running after an interruption finishes the job and never
     * duplicates an account or a Chips movement.
     */
    public function run(UserManagementService $users, AllocationService $allocations): void
    {
        $find = fn (string $username) => User::query()->where('username', $username)->first();

        $make = fn (?User $actor, Role $role, string $username, string $name) => $find($username) ?? $users->create($actor, $role, [
            'name' => $name,
            'username' => $username,
            'email' => "{$username}@pusoy.test",
            'password' => 'password',
        ]);

        $super = $find('superadmin') ?? CreateSuperAdmin::bootstrap('Super Admin', 'superadmin', 'superadmin@pusoy.test', 'password');

        $admin = $find('admin');
        if ($admin === null) {
            $admin = $make($super, Role::Administrator, 'admin', 'Platform Admin');
            $users->syncPermissions($super, $admin, array_values(array_diff(
                array_map(fn (Ability $a) => $a->value, Ability::cases()),
                [Ability::ViewAuditLogs->value],
            )));
        }

        $agent = $make($super, Role::Agent, 'agent', 'Agent Alpha');
        $agent2 = $make($super, Role::Agent, 'agent2', 'Agent Bravo');

        // Chips are only ever issued by the Super Admin into their own wallet; every load draws on it.
        $allocations->issue($super, 1_000_000_00, 'Development Chips float', 'seed-float');
        $allocations->allocate($super, $admin, Currency::CH, 500_000_00, 'Initial admin Chips allocation', 'seed-admin');
        $allocations->allocate($super, $agent, Currency::CH, 10_000_00, 'Initial agent Chips allocation', 'seed-agent');
        $allocations->allocate($super, $agent2, Currency::CH, 10_000_00, 'Initial agent Chips allocation', 'seed-agent2');

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
