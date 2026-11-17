<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Records when an authenticated user was last active (friends list "online"
 * dot). Written at most once a minute per user to keep it cheap.
 */
class TouchLastSeen
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $user = $request->user('sanctum') ?? $request->user();

        if ($user && (! $user->last_seen_at || $user->last_seen_at->lt(now()->subMinute()))) {
            $user->forceFill(['last_seen_at' => now()])->saveQuietly();
        }

        return $response;
    }
}
