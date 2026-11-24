<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Models\UserDevice;
use App\Exceptions\BusinessRuleException;
use App\Services\Users\ReferralService;
use App\Services\Users\UserManagementService;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

/**
 * Mobile authentication with Sanctum bearer tokens (one token per device).
 * The web app uses the session-based Baseplate login instead.
 */
class AuthController extends Controller
{
    /**
     * Public registration (optionally through a referral link). The account is PENDING until an
     * administrator approves it, so no token is issued; the sponsor is fixed now and never changes.
     */
    public function register(RegisterRequest $request, ReferralService $referrals): JsonResponse
    {
        $data = $request->validated();
        $user = $referrals->register(
            collect($data)->only(['name', 'username', 'email', 'phone', 'password'])->all(),
            $data['referral_code'] ?? null,
            $data['account_type'] ?? 'player',
        );

        return response()->json([
            'message' => 'Registration received. Your account is waiting for administrator approval.',
            'data' => ['status' => $user->status->value, 'username' => $user->username, 'account_type' => $user->registered_as, 'sponsor' => $user->sponsor?->username],
        ], 201);
    }

    /** Who a referral link belongs to and what it registers (shown on the registration page). */
    public function referral(Request $request, ReferralService $referrals, string $code): JsonResponse
    {
        $type = $request->query('type', 'player') === 'agent' ? 'agent' : 'player';
        $r = $referrals->resolve($code, $type);

        return response()->json(['data' => ['sponsor' => $r['sponsor']->username, 'sponsor_name' => $r['sponsor']->name, 'type' => $type, 'level' => $r['level']?->label() ?? 'Player']]);
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:100'],
            'platform' => ['nullable', 'in:android,ios,web'],
        ]);

        $user = User::query()->where('username', $credentials['username'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages(['username' => 'The provided credentials do not match our records.']);
        }

        if (! $user->isActive()) {
            // Pending (waiting for approval), suspended, banned or archived: no session.
            throw new BusinessRuleException($user->status->blockedMessage(), 403, $user->status->blockedCode());
        }

        // Mobile Game (app token): Players only — Admins, staff and agents use the Web App.
        if (! \App\Support\PlatformAccess::allowsGame($user)) {
            throw new BusinessRuleException(\App\Support\PlatformAccess::WEB_ONLY_TITLE.'. '.\App\Support\PlatformAccess::WEB_ONLY_MESSAGE, 403, 'web_only');
        }

        if ($user->signInBlocked()) {
            throw new BusinessRuleException(User::SIGN_IN_DISABLED_MESSAGE, 403, 'player_login_disabled');
        }

        if ($user->isPlayer() && in_array($credentials['platform'] ?? null, ['android', 'ios'], true)) {
            app(\App\Services\System\MaintenanceService::class)->assertGameOpen();
        }

        return $this->tokenResponse($request, $user);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()->currentAccessToken();

        if ($token && method_exists($token, 'delete')) {
            UserDevice::query()->where('personal_access_token_id', $token->id)->delete();
            $token->delete();
        } else {
            Auth::guard('web')->logout();
        }

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user()->load(['profile', 'agent', 'agentLink.agent.user']));
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);
        Password::sendResetLink($request->only('email'));

        // Same response whether or not the email exists (no account enumeration).
        return response()->json(['message' => 'If that email is registered, a reset link has been sent.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);

        $status = Password::reset($request->only('email', 'password', 'password_confirmation', 'token'), function (User $user, string $password) {
            $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
            $user->tokens()->delete();
            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => __($status)]);
        }

        return response()->json(['message' => __($status)]);
    }

    /**
     * Register (or clear) the FCM push token for the device behind the
     * current bearer token. Called by the mobile app after login.
     */
    public function pushToken(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['present', 'nullable', 'string', 'max:4096'],
            'platform' => ['nullable', 'in:android,ios,web'],
        ]);

        $accessToken = $request->user()->currentAccessToken();
        abort_unless($accessToken && isset($accessToken->id), 422, 'Push tokens can only be registered from a mobile device session.');

        // A push token belongs to one device: detach it from any other row first.
        if ($data['token']) {
            UserDevice::query()->where('push_token', $data['token'])->update(['push_token' => null]);
        }

        $device = UserDevice::query()->updateOrCreate(
            ['user_id' => $request->user()->id, 'personal_access_token_id' => $accessToken->id],
            ['device_name' => $accessToken->name, 'push_token' => $data['token'], 'platform' => $data['platform'] ?? null, 'last_used_at' => now()],
        );

        return response()->json(['data' => ['device_id' => $device->id, 'push_enabled' => $device->push_token !== null]]);
    }

    public function devices(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->devices()->latest('last_used_at')->get(['id', 'device_name', 'platform', 'last_used_at', 'created_at'])]);
    }

    public function revokeDevice(Request $request, UserDevice $device): JsonResponse
    {
        abort_unless($device->user_id === $request->user()->id, 404);

        $request->user()->tokens()->whereKey($device->personal_access_token_id)->delete();
        $device->delete();

        return response()->json(['message' => 'Device signed out.']);
    }

    private function tokenResponse(Request $request, User $user, int $status = 200): JsonResponse
    {
        $deviceName = $request->input('device_name') ?: 'mobile';
        $token = $user->createToken($deviceName, ['*'], now()->addDays(30));

        UserDevice::create([
            'user_id' => $user->id,
            'personal_access_token_id' => $token->accessToken->id,
            'device_name' => $deviceName,
            'platform' => $request->input('platform'),
            'ip_address' => $request->ip(),
            'last_used_at' => now(),
        ]);

        $user->forceFill(['last_login_at' => now()])->save();

        return response()->json([
            'data' => [
                'token' => $token->plainTextToken,
                'token_type' => 'Bearer',
                'expires_at' => $token->accessToken->expires_at?->toIso8601String(),
                'user' => (new UserResource($user->load(['profile', 'agent'])))->resolve($request),
            ],
        ], $status);
    }
}
