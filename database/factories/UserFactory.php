<?php

namespace Database\Factories;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\Agent;
use App\Models\User;
use App\Services\Wallet\WalletService;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'username' => fake()->unique()->userName().Str::lower(Str::random(3)),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => Role::Player,
            'status' => UserStatus::Active,
            'remember_token' => Str::random(10),
        ];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (User $user) {
            app(WalletService::class)->provision($user);

            if ($user->isPlayer()) {
                $user->profile()->firstOrCreate([], ['display_name' => $user->name]);
            }

            if ($user->isAgent() && ! Agent::query()->where('user_id', $user->id)->exists()) {
                $user->setRelation('agent', Agent::create(['user_id' => $user->id, 'code' => 'AG'.strtoupper(Str::random(6)), 'status' => 'active']));
            }
        });
    }

    public function superAdmin(): static
    {
        return $this->state(fn () => ['role' => Role::SuperAdmin]);
    }

    public function administrator(): static
    {
        return $this->state(fn () => ['role' => Role::Administrator]);
    }

    public function agent(): static
    {
        return $this->state(fn () => ['role' => Role::Agent]);
    }

    public function player(): static
    {
        return $this->state(fn () => ['role' => Role::Player]);
    }

    public function suspended(): static
    {
        return $this->state(fn () => ['status' => UserStatus::Suspended]);
    }

    public function unverified(): static
    {
        return $this->state(fn () => ['email_verified_at' => null]);
    }
}
