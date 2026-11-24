<?php

namespace App\Providers;

use App\Enums\Ability;
use App\Events\Game\LobbyEvent;
use App\Events\Game\TableEvent;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Services\Game\LobbyService;
use Illuminate\Support\Facades\Event;
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

        // Real-time refresh of the Admin / Agent Panels.
        foreach ([\App\Models\ChipLoad::class, \App\Models\AgentCommission::class, \App\Models\AgentPayoutRequest::class, User::class] as $model) {
            $model::observe(\App\Observers\PanelActivityObserver::class);
        }

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
        // Joining a lobby (password guesses included): a few per minute per player.
        RateLimiter::for('lobby-join', fn (Request $request) => Limit::perMinute(15)->by('lobby-join:'.($request->user()?->id ?: $request->ip())));

        // Multiplayer lobbies: any seat change, ready toggle, start or end at a lobby's table also
        // tells every open Lobby screen to refresh (public `lobbies` channel, public info only).
        Event::listen(TableEvent::class, function (TableEvent $event) {
            if (! in_array($event->name, LobbyService::TABLE_EVENTS_THAT_CHANGE_LOBBIES, true)) {
                return;
            }
            $roomId = GameTable::query()->whereKey($event->tableId)->value('game_room_id');
            if ($roomId && GameRoom::query()->whereKey($roomId)->whereNotNull('lobby_code')->exists()) {
                event(new LobbyEvent((int) $roomId, $event->name));
            }
        });
    }
}
