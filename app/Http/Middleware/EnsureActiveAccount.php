<?php

namespace App\Http\Middleware;

use App\Enums\UserStatus;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Suspended accounts are logged out of the web session and refused on the API.
 */
class EnsureActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->status === UserStatus::Suspended) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['message' => 'This account is suspended.', 'error' => 'suspended'], 403);
            }

            Auth::guard('web')->logout();
            $request->session()->invalidate();

            return redirect()->route('login')->withErrors(['username' => 'This account is suspended.']);
        }

        return $next($request);
    }
}
