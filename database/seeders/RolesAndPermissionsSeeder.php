<?php

namespace Database\Seeders;

use App\Enums\Ability;
use App\Enums\Role;
use App\Models\AgentCommissionRule;
use App\Models\Permission;
use App\Models\Role as RoleModel;
use Illuminate\Database\Seeder;

class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        foreach (Role::cases() as $role) {
            RoleModel::query()->updateOrCreate(['key' => $role->value], ['name' => $role->label(), 'level' => $role->level()]);
        }

        foreach (Ability::cases() as $ability) {
            Permission::query()->updateOrCreate(['key' => $ability->value], ['description' => $ability->description()]);
        }

        // Platform default commission: 40% of eligible platform fees.
        AgentCommissionRule::query()->firstOrCreate(
            ['agent_id' => null, 'currency' => null, 'is_active' => true],
            ['rate_bps' => 4000],
        );
    }
}
