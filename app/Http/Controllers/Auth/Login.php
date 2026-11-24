<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Baseplate's session login for the web app (the mobile app uses Sanctum
 * tokens via /api/v1/auth/login). Redirects each role to its own home.
 */
class Login extends Controller
{
    public function showLoginForm(): Response
    {
        return Inertia::render('Auth/Login');
    }

    public function login(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        if (Auth::attempt($validated, $request->boolean('remember'))) {
            /** @var User $user */
            $user = Auth::user();

            if (! $user->isActive()) {
                Auth::logout();

                throw ValidationException::withMessages(['username' => $user->status->blockedMessage()]);
            }

            // Web App: Admins, staff and agents only — Players use the Mobile Game.
            if (! \App\Support\PlatformAccess::allowsWeb($user)) {
                Auth::logout();

                throw ValidationException::withMessages(['platform' => \App\Support\PlatformAccess::MOBILE_ONLY_MESSAGE]);
            }

            if ($user->signInBlocked()) {
                Auth::logout();

                throw ValidationException::withMessages(['username' => User::SIGN_IN_DISABLED_MESSAGE]);
            }

            $request->session()->regenerate();
            $user->forceFill(['last_login_at' => now()])->save();

            // /dashboard forwards agents and staff to their own home pages.
            return redirect()->intended(route('dashboard'));
        }

        throw ValidationException::withMessages([
            'username' => 'The provided credentials do not match our records.',
        ]);
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }

    public static function homeFor(User $user): string
    {
        return match (true) {
            $user->isPlayer() => route('dashboard'),
            $user->isAgent() => route('agent.overview'),
            $user->isLoader() => route('loader.overview'),
            default => route('admin.overview'),
        };
    }
}
