<?php

namespace App\Http\Middleware;

use App\Support\PlatformAccess;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Every request: the account must be on its own platform (App\Support\PlatformAccess).
 *  - App token (Mobile Game) of a non-player → refused and the token revoked;
 *  - Browser session (Web App) of a player → signed out and refused.
 * Signing out is always allowed.
 */
class EnsurePlatformAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! PlatformAccess::enabled() || $request->is('logout', 'api/v1/auth/logout')) {
            return $next($request);
        }

        $token = $user->currentAccessToken();

        if ($token instanceof PersonalAccessToken) {
            if (! PlatformAccess::allowsGame($user)) {
                $token->delete();

                return response()->json(['message' => PlatformAccess::WEB_ONLY_TITLE.'. '.PlatformAccess::WEB_ONLY_MESSAGE, 'error' => 'web_only'], 403);
            }

            return $next($request);
        }

        if (! PlatformAccess::allowsWeb($user)) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['message' => PlatformAccess::MOBILE_ONLY_TITLE.'. '.PlatformAccess::MOBILE_ONLY_MESSAGE, 'error' => 'mobile_only'], 403);
            }

            return redirect()->route('login')->withErrors(['platform' => PlatformAccess::MOBILE_ONLY_MESSAGE]);
        }

        return $next($request);
    }
}
