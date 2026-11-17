<?php

namespace App\Providers;

use App\Enums\Ability;
use App\Models\GameSession;
use App\Models\User;
use App\Policies\GameSessionPolicy;
use App\Policies\UserPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Gate::policy(User::class, UserPolicy::class);
        Gate::policy(GameSession::class, GameSessionPolicy::class);

        // One gate per configurable ability. Super Admin holds all of them
        // (see User::hasAbility); administrators only what was granted.
        foreach (Ability::cases() as $ability) {
            Gate::define($ability->value, fn (User $user) => $user->isActive() && $user->hasAbility($ability));
        }

        Gate::define('staff', fn (User $user) => $user->isActive() && ($user->isSuperAdmin() || $user->isAdministrator()));
        Gate::define('super-admin', fn (User $user) => $user->isActive() && $user->isSuperAdmin());
        Gate::define('agent', fn (User $user) => $user->isActive() && $user->isAgent() && $user->agent?->status === 'active');
        Gate::define('play', fn (User $user) => $user->isActive() && $user->isPlayer());

        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('auth', fn (Request $request) => [
            Limit::perMinute(10)->by('auth:'.$request->ip()),
            Limit::perMinute(5)->by('auth:'.strtolower((string) $request->input('username'))),
        ]);
        RateLimiter::for('game-actions', fn (Request $request) => Limit::perMinute(60)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('wallet-actions', fn (Request $request) => Limit::perMinute(30)->by($request->user()?->id ?: $request->ip()));
    }
}
