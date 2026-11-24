<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Loader Accounts (employees): the role row and the three Loader permissions, so existing
 * databases have them without re-running the seeders. Users already store the role as a string.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        if (DB::getSchemaBuilder()->hasTable('roles') && ! DB::table('roles')->where('key', 'loader')->exists()) {
            DB::table('roles')->insert(['key' => 'loader', 'name' => 'Loader', 'level' => 30, 'created_at' => $now, 'updated_at' => $now]);
        }

        foreach (\App\Enums\LoaderPermission::cases() as $permission) {
            if (! DB::table('permissions')->where('key', $permission->value)->exists()) {
                DB::table('permissions')->insert(['key' => $permission->value, 'description' => $permission->description(), 'created_at' => $now, 'updated_at' => $now]);
            }
        }
    }

    public function down(): void
    {
        DB::table('permissions')->whereIn('key', \App\Enums\LoaderPermission::values())->delete();
        DB::table('roles')->where('key', 'loader')->delete();
    }
};
