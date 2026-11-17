<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\WalletService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

/**
 * Creates the first Super Admin on a fresh install (production included).
 * Further Super Admins are created by an existing Super Admin in the UI.
 */
#[Signature('pusoy:create-super-admin {username} {email} {--name=Super Admin}')]
#[Description('Create a Super Admin account (prompts for the password)')]
class CreateSuperAdmin extends Command
{
    public function handle(): int
    {
        $password = $this->secret('Password (min 12 characters)');

        $validator = Validator::make(
            ['username' => $this->argument('username'), 'email' => $this->argument('email'), 'password' => $password],
            ['username' => ['required', 'alpha_dash', 'unique:users,username'], 'email' => ['required', 'email', 'unique:users,email'], 'password' => ['required', 'min:12']],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = self::bootstrap($this->option('name'), $this->argument('username'), $this->argument('email'), $password);
        $this->info("Super Admin [{$user->username}] created.");

        return self::SUCCESS;
    }

    public static function bootstrap(string $name, string $username, string $email, string $password): User
    {
        $user = new User(['name' => $name, 'username' => $username, 'email' => $email, 'password' => $password]);
        $user->forceFill(['role' => Role::SuperAdmin, 'status' => UserStatus::Active, 'email_verified_at' => now()])->save();

        app(WalletService::class)->provision($user);
        AuditLogger::log(null, 'user.create_super_admin', $user, null, ['username' => $username]);

        return $user;
    }
}
