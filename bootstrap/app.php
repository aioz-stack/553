<?php

use App\Http\Middleware\EnsureActiveAccount;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\TouchLastSeen;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    // Channel auth accepts both the web session and Sanctum bearer tokens
    // (mobile app), at /broadcasting/auth and /api/v1/broadcasting/auth.
    ->withBroadcasting(
        __DIR__.'/../routes/channels.php',
        ['prefix' => 'api/v1', 'middleware' => ['api', 'auth:sanctum']],
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            \App\Http\Middleware\NoticeDisconnectedSession::class,
            HandleInertiaRequests::class,
            EnsureActiveAccount::class,
            \App\Http\Middleware\EnsurePlatformAccess::class,
        ]);

        // Allows the Inertia web app to call /api/v1 with its session cookie.
        $middleware->statefulApi();

        $middleware->api(append: [EnsureActiveAccount::class, \App\Http\Middleware\EnsurePlatformAccess::class, TouchLastSeen::class]);

        $middleware->alias([
            'role' => EnsureRole::class,
            'game.open' => \App\Http\Middleware\EnsureGameOpen::class,
        ]);

        // Behind aaPanel Nginx / Cloudflare: trust the proxy headers.
        $middleware->trustProxies(at: '*');

        // Authenticated users land on the dashboard, guests get sent to the login page.
        $middleware->redirectUsersTo('/dashboard');
        $middleware->redirectGuestsTo('/');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());

        // A player's app token / browser session revoked by the one-login rule: say why (the apps
        // show "Account Already Connected" and go back to the login screen) instead of a bare 401.
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, Request $request) {
            if (! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }
            $reason = \App\Services\Users\PlayerSessions::reasonForToken($request->bearerToken())
                ?? ($request->hasSession() ? \App\Services\Users\PlayerSessions::reasonForSession($request->session()->getId()) : null);

            return $reason ? \App\Services\Users\PlayerSessions::jsonResponse($reason) : null;
        });
    })->create();
