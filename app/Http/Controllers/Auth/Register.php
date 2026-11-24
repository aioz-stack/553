<?php

namespace App\Http\Controllers\Auth;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterRequest;
use App\Services\Users\ReferralService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public player self-registration (optionally with an agent referral code)
 * and password reset for the web app.
 */
class Register extends Controller
{
    /** /register, /register/player?ref=CODE and /register/agent?ref=CODE (permanent referral links). */
    public function show(Request $request, ?string $type = null): Response
    {
        return Inertia::render('Auth/Register', ['referral' => $request->query('ref'), 'accountType' => $type === 'agent' ? 'agent' : 'player']);
    }

    /** The new account waits for administrator approval: no sign-in until then. */
    public function store(RegisterRequest $request, ReferralService $referrals): RedirectResponse
    {
        $data = $request->validated();
        $user = $referrals->register(
            collect($data)->only(['name', 'username', 'email', 'phone', 'password'])->all(),
            $data['referral_code'] ?? null,
            $data['account_type'] ?? 'player',
        );

        return redirect()->route('login')->with('success', $user->isPlayer() && \App\Support\PlatformAccess::enabled()
            ? 'Registration received. Once an administrator approves your account, sign in with the Pusoy553 mobile app.'
            : 'Registration received. You can sign in once an administrator approves your account.');
    }

    public function forgot(): Response
    {
        return Inertia::render('Auth/ForgotPassword');
    }

    public function sendResetLink(Request $request): RedirectResponse
    {
        $request->validate(['email' => ['required', 'email']]);
        Password::sendResetLink($request->only('email'));

        return back()->with('success', 'If that email is registered, a reset link has been sent.');
    }

    public function resetForm(Request $request, string $token): Response
    {
        return Inertia::render('Auth/ResetPassword', ['token' => $token, 'email' => $request->query('email')]);
    }

    public function reset(Request $request): RedirectResponse
    {
        $request->validate([
            'token' => ['required'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);

        $status = Password::reset($request->only('email', 'password', 'password_confirmation', 'token'), function ($user, string $password) {
            $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
            $user->tokens()->delete();
        });

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => __($status)]);
        }

        return redirect()->route('login')->with('success', __($status));
    }
}
