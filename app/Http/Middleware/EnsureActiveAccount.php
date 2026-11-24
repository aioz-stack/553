<?php

namespace App\Http\Middleware;

use App\Enums\UserStatus;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Only Active accounts get through: pending, suspended, banned and archived accounts are logged
 * out of the web session and refused on the API (their token is revoked). While player sign-in
 * is switched off (PLAYER_LOGIN_ENABLED=false), players are refused the same way.
 */
class EnsureActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Pending, suspended, banned and archived accounts are refused everywhere.
        if ($user && $user->status !== UserStatus::Active) {
            if ($request->expectsJson() || $request->is('api/*')) {
                $token = $user->currentAccessToken();
                if ($token instanceof \Laravel\Sanctum\PersonalAccessToken) {
                    $token->delete();
                }

                return response()->json(['message' => $user->status->blockedMessage(), 'error' => $user->status->blockedCode()], 403);
            }

            Auth::guard('web')->logout();
            $request->session()->invalidate();

            return redirect()->route('login')->withErrors(['username' => $user->status->blockedMessage()]);
        }

        // Player sign-in switched off: players already signed in are refused too. Their app tokens
        // are kept, so they work again as soon as player sign-in is switched back on.
        if ($user && $user->signInBlocked() && ! $request->is('api/v1/auth/logout', 'logout')) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['message' => \App\Models\User::SIGN_IN_DISABLED_MESSAGE, 'error' => 'player_login_disabled'], 403);
            }

            Auth::guard('web')->logout();
            $request->session()->invalidate();

            return redirect()->route('login')->withErrors(['username' => \App\Models\User::SIGN_IN_DISABLED_MESSAGE]);
        }

        return $next($request);
    }
}
