<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolesAndPermissionsSeeder::class,
            GameRoomSeeder::class,
        ]);

        // Demo accounts and balances are for local development only.
        if (app()->environment(['local', 'testing'])) {
            $this->call(DevelopmentDataSeeder::class);
        }
    }
}
