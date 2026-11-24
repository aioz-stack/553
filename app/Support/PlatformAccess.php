<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Which platform each role may use:
 *
 * | Role                                          | Web App (session) | Mobile Game (app token) |
 * | Super Admin, Administrator, Loader (staff)    | allowed           | blocked                 |
 * | Agent, Master Agent, Silver Agent             | allowed           | blocked                 |
 * | Player                                        | blocked           | allowed                 |
 *
 * The platform is how the account is signed in, not anything the request claims: the Web App
 * uses the browser session (POST /login), the Mobile Game a Sanctum app token
 * (POST /api/v1/auth/login). Both sign-ins check the role, and EnsurePlatformAccess checks it
 * again on every request, so an old token or session cannot be reused on the wrong platform.
 * Switch: PLATFORM_LOGIN_LOCK (on by default).
 */
final class PlatformAccess
{
    public const MOBILE_ONLY_TITLE = 'Mobile App Required';

    public const MOBILE_ONLY_MESSAGE = 'Player accounts can only access Pusoy553 through the official Mobile Game application.';

    public const WEB_ONLY_TITLE = 'Mobile Game Access Restricted';

    public const WEB_ONLY_MESSAGE = 'Your account is authorized to access the Pusoy553 Web Platform only. Please use the Web App to log in.';

    public static function enabled(): bool
    {
        return (bool) config('pusoy.features.platform_lock', true);
    }

    /** May this account use the Web App (browser session)? */
    public static function allowsWeb(User $user): bool
    {
        return ! self::enabled() || ! $user->isPlayer();
    }

    /** May this account use the Mobile Game (app token)? */
    public static function allowsGame(User $user): bool
    {
        return ! self::enabled() || $user->isPlayer();
    }

    /** Was this request authenticated with an app token (Mobile Game) rather than a session (Web App)? */
    public static function viaAppToken(Request $request): bool
    {
        return $request->user()?->currentAccessToken() instanceof PersonalAccessToken;
    }
}
