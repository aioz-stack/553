<?php

namespace App\Http\Middleware;

use App\Enums\UserStatus;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Only Active accounts get through: pending, suspended, banned and archived accounts are logged
 * out of the web session and refused on the API (their token is revoked).
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

        return $next($request);
    }
}
