<?php

namespace App\Services\Users;

use App\Events\Game\UserEvent;
use App\Exceptions\BusinessRuleException;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Audit\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * One active login per Player account (Mobile Game app tokens and Web App browser sessions alike).
 *
 * A player's sign-in is checked here before it is granted:
 *  - Another session of the account is ACTIVE (used within the last `pusoy.sessions.active_minutes`):
 *    a duplicate login. EVERY session is signed out — the original ones and this new attempt — all
 *    app tokens are revoked and all browser sessions deleted, and the sign-in is refused with
 *    "Account Already Connected". The player signs in again (there is then nothing left to clash).
 *  - Only stale sessions remain (an old phone that never logged out): they are quietly revoked and
 *    the sign-in goes ahead, so the account still has exactly one session.
 *
 * Every revoked token / browser session is remembered (cache, by token id or session id) so its
 * next request is answered with the reason (`account_already_connected`) instead of a bare 401, and
 * the apps show the popup and return to the login screen. Connected apps are also told at once on
 * the player's private channel (`account.disconnected`). Staff and agents are not affected.
 */
class PlayerSessions
{
    public const ERROR = 'account_already_connected';

    public const TITLE = 'Account Already Connected';

    public const MESSAGE = 'This account has been detected logging in from multiple sessions. For security reasons, all sessions have been disconnected. Please log in again to continue.';

    /** How long a revoked token / session is recognised and answered with the reason. */
    private const REMEMBER_SECONDS = 86_400;

    public static function activeMinutes(): int
    {
        return max(1, (int) config('pusoy.sessions.active_minutes', 15));
    }

    /**
     * Call before granting a player's sign-in. Throws (after signing every session out) on a
     * duplicate login; otherwise clears stale sessions so the new one is the only one.
     *
     * @param  string|null  $keepSessionId  the browser session signing in now (web), never deleted here
     */
    public function beginLogin(User $user, ?string $keepSessionId = null): void
    {
        if (! $user->isPlayer()) {
            return;
        }

        $since = now()->subMinutes(self::activeMinutes());
        $activeTokens = PersonalAccessToken::query()->where('tokenable_type', $user->getMorphClass())->where('tokenable_id', $user->id)
            ->where(fn ($q) => $q->where('last_used_at', '>=', $since)->orWhere(fn ($w) => $w->whereNull('last_used_at')->where('created_at', '>=', $since)))
            ->exists();
        $activeWeb = $this->webSessions($user, $keepSessionId)->where('last_activity', '>=', $since->getTimestamp())->exists();

        if ($activeTokens || $activeWeb) {
            $this->disconnectAll($user, 'duplicate_login');

            throw new BusinessRuleException(self::TITLE.'. '.self::MESSAGE, 409, self::ERROR);
        }

        // Nothing active: old sessions are simply replaced by this one.
        $this->revoke($user, 'replaced', $keepSessionId);
    }

    /** Sign out every session of the account (tokens and browser sessions) and tell its open apps. */
    public function disconnectAll(User $user, string $reason): void
    {
        event(new UserEvent($user->id, 'account.disconnected', ['error' => self::ERROR, 'title' => self::TITLE, 'message' => self::MESSAGE]));
        $count = $this->revoke($user, $reason, null);
        AuditLogger::log(null, 'player.sessions_disconnected', $user, null, ['reason' => $reason, 'sessions' => $count]);
    }

    /** The reason a revoked app token (by its id) was signed out, or null. */
    public static function reasonForToken(?string $bearer): ?string
    {
        if (! $bearer || ! str_contains($bearer, '|')) {
            return null;
        }
        $id = (int) strtok($bearer, '|');

        return $id > 0 ? Cache::get("player-session:token:{$id}") : null;
    }

    public static function reasonForSession(string $sessionId): ?string
    {
        return Cache::get("player-session:web:{$sessionId}");
    }

    public static function forgetSession(string $sessionId): void
    {
        Cache::forget("player-session:web:{$sessionId}");
    }

    /** Revoke every token and browser session of the user (except $keepSessionId); returns how many. */
    private function revoke(User $user, string $reason, ?string $keepSessionId): int
    {
        $tokens = PersonalAccessToken::query()->where('tokenable_type', $user->getMorphClass())->where('tokenable_id', $user->id)->pluck('id')->all();
        $sessions = $this->webSessions($user, $keepSessionId)->pluck('id')->all();

        foreach ($tokens as $id) {
            Cache::put("player-session:token:{$id}", $reason, self::REMEMBER_SECONDS);
        }
        foreach ($sessions as $id) {
            Cache::put("player-session:web:{$id}", $reason, self::REMEMBER_SECONDS);
        }

        if ($tokens !== []) {
            UserDevice::query()->whereIn('personal_access_token_id', $tokens)->delete();
            PersonalAccessToken::query()->whereIn('id', $tokens)->delete();
        }
        if ($sessions !== []) {
            DB::table(config('session.table', 'sessions'))->whereIn('id', $sessions)->delete();
        }

        return count($tokens) + count($sessions);
    }

    private function webSessions(User $user, ?string $keepSessionId)
    {
        if (config('session.driver') !== 'database') {
            return DB::table(config('session.table', 'sessions'))->whereRaw('1 = 0');
        }

        return DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)
            ->when($keepSessionId, fn ($q) => $q->where('id', '!=', $keepSessionId));
    }

    /** The JSON answer for a revoked app token / API call. */
    public static function jsonResponse(string $reason): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'message' => $reason === 'duplicate_login' ? self::TITLE.'. '.self::MESSAGE : 'You were signed out because this account signed in on another device. Please log in again.',
            'error' => $reason === 'duplicate_login' ? self::ERROR : 'session_replaced',
            'title' => $reason === 'duplicate_login' ? self::TITLE : 'Signed Out',
        ], 401);
    }

    public static function bearer(Request $request): ?string
    {
        return $request->bearerToken();
    }
}
