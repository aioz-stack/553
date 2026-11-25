<?php

namespace App\Http\Middleware;

use App\Services\Users\PlayerSessions;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Web App: a browser whose session was signed out by the one-login rule (PlayerSessions) comes
 * back with the same session id. Send it to the login page once, with the reason, so the page
 * shows "Account Already Connected" (or that the account signed in elsewhere).
 */
class NoticeDisconnectedSession
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() || ! $request->hasSession() || $request->expectsJson() || $request->is('api/*')) {
            return $next($request);
        }

        $id = $request->session()->getId();
        $reason = PlayerSessions::reasonForSession($id);
        if ($reason === null) {
            return $next($request);
        }

        PlayerSessions::forgetSession($id);
        $message = $reason === 'duplicate_login'
            ? PlayerSessions::MESSAGE
            : 'You were signed out because this account signed in on another device. Please log in again.';

        return redirect()->route('login')->withErrors(['session' => $message]);
    }
}
