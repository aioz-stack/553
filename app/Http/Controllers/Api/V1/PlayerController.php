<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameSessionResource;
use App\Http\Resources\UserResource;
use App\Models\GameSession;
use App\Models\PlayerProfile;
use App\Models\SystemSetting;
use App\Enums\MaintenanceMode;
use App\Services\System\MaintenanceService;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Events\Game\GameEvents;
use App\Events\Game\TableEvent;
use App\Services\Game\TableService;
use App\Services\Reports\ReportService;
use App\Support\Avatars;
use Illuminate\Validation\Rule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rules\Password;

class PlayerController extends Controller
{
    public function profile(Request $request): UserResource
    {
        return new UserResource($request->user()->load(['profile', 'agentLink.agent.user']));
    }

    public function updateProfile(Request $request): UserResource
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'display_name' => ['sometimes', 'nullable', 'string', 'max:40'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'country' => ['sometimes', 'nullable', 'string', 'size:2'],
        ]);

        $user = $request->user();
        $user->fill(array_intersect_key($data, array_flip(['name', 'phone'])))->save();

        if (array_intersect_key($data, array_flip(['display_name', 'country']))) {
            $user->profile()->updateOrCreate([], array_intersect_key($data, array_flip(['display_name', 'country'])));
        }

        return new UserResource($user->load('profile'));
    }

    /**
     * PUT /profile/avatar — choose your cartoon avatar (one of App\Support\Avatars::ids()). Saved on
     * your account; anyone at your table (and every open Lobby screen) is told to refresh, so the new
     * avatar shows everywhere at once.
     */
    public function updateAvatar(Request $request, TableService $tables): JsonResponse
    {
        $data = $request->validate(['avatar' => ['required', 'string', Rule::in(Avatars::ids())]], [
            'avatar.in' => 'Choose one of the avatars in the gallery.',
        ]);

        $user = $request->user();
        $old = $user->avatarId();
        $user->forceFill(['avatar' => $data['avatar']])->save();
        AuditLogger::log($user, 'user.avatar_changed', $user, ['avatar' => $old], ['avatar' => $data['avatar']]);

        if ($seat = $tables->activeSeat($user)) {
            event(new TableEvent($seat->game_table_id, GameEvents::PLAYER_UPDATED, ['user_id' => $user->id, 'avatar' => $data['avatar']]));
        }

        return response()->json(['data' => ['avatar' => $user->avatarId()]]);
    }

    /**
     * PUT /profile/nickname — your in-game nickname (player_profiles.display_name), shown on the
     * Main Lobby, tables, friends and results. 2–20 letters, numbers, spaces, "." "_" or "-".
     * Anyone at your table is told to refresh, so it changes everywhere at once.
     */
    public function updateNickname(Request $request, TableService $tables): JsonResponse
    {
        $request->merge(['nickname' => preg_replace('/\s+/u', ' ', trim((string) $request->input('nickname')))]);
        $data = $request->validate(['nickname' => ['required', 'string', 'min:2', 'max:20', 'regex:/^[\pL\pN][\pL\pN ._-]*$/u']], [
            'nickname.required' => 'Enter a nickname.',
            'nickname.min' => 'Your nickname needs at least 2 characters.',
            'nickname.max' => 'Your nickname can be at most 20 characters.',
            'nickname.regex' => 'Use letters, numbers, spaces, "." "_" or "-" only.',
        ]);

        $user = $request->user();
        $old = $user->profile?->display_name;
        $user->profile()->updateOrCreate([], ['display_name' => $data['nickname']]);
        AuditLogger::log($user, 'user.nickname_changed', $user, ['nickname' => $old], ['nickname' => $data['nickname']]);

        if ($seat = $tables->activeSeat($user)) {
            event(new TableEvent($seat->game_table_id, GameEvents::PLAYER_UPDATED, ['user_id' => $user->id, 'name' => $data['nickname']]));
        }

        return response()->json(['data' => ['nickname' => $data['nickname']]]);
    }

    /** Your saved game settings: { bgm: bool, sfx: bool, motion: low|medium|high }. */
    public function preferences(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->gamePreferences()]);
    }

    /** Save any of bgm / sfx / motion; the others keep their saved values. */
    public function updatePreferences(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bgm' => ['sometimes', 'boolean'],
            'sfx' => ['sometimes', 'boolean'],
            'motion' => ['sometimes', 'string', 'in:'.implode(',', User::MOTION_LEVELS)],
            // Web dashboard / Admin Panel colour theme.
            'theme' => ['sometimes', 'string', 'in:light,dark'],
        ]);

        $user = $request->user();
        $theme = $data['theme'] ?? null;
        unset($data['theme']);
        $raw = is_array($user->preferences) ? $user->preferences : [];
        $saved = array_merge($raw, $user->gamePreferences(), array_map(fn ($v) => is_string($v) ? $v : (bool) $v, $data));
        if (array_key_exists('motion', $data)) {
            $saved['motion_chosen'] = true; // picked by the player (not the device default)
        }
        if ($theme !== null) {
            $saved['theme'] = $theme;
        }
        $user->forceFill(['preferences' => $saved])->save();

        return response()->json(['data' => $user->gamePreferences() + (isset($saved['theme']) ? ['theme' => $saved['theme']] : [])]);
    }

    /**
     * Change your password: the current password must be right, the new one at least 8 characters with
     * letters and numbers, confirmed, and different from the current one. Stored hashed (User cast).
     */
    public function updatePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string', 'current_password:sanctum'],
            'password' => ['required', 'string', 'confirmed', 'different:current_password', Password::min(8)->letters()->numbers()],
        ], [
            'current_password.current_password' => 'Your current password is incorrect.',
            'password.different' => 'The new password must be different from your current password.',
            'password.confirmed' => 'The new password and confirmation do not match.',
        ]);

        $request->user()->forceFill(['password' => $data['password']])->save();
        AuditLogger::log($request->user(), 'user.password_changed', $request->user());

        return response()->json(['message' => 'Password updated.']);
    }

    public function stats(Request $request, ReportService $reports): JsonResponse
    {
        return response()->json(['data' => $reports->playerStats($request->user())]);
    }

    public function history(Request $request): AnonymousResourceCollection
    {
        $sessions = GameSession::query()
            ->whereHas('cards', fn ($q) => $q->where('user_id', $request->user()->id))
            ->with('results.user:id,name')
            ->latest('id')
            ->paginate(min((int) $request->integer('per_page', 15), 50));

        return GameSessionResource::collection($sessions);
    }

    public function leaderboard(Request $request): JsonResponse
    {
        $rows = PlayerProfile::query()->with('user:id,name,username,avatar')
            ->where('games_played', '>', 0)
            ->orderByDesc('total_score')->orderByDesc('games_won')
            ->limit(min((int) $request->integer('limit', 50), 100))
            ->get()
            ->values()
            ->map(fn (PlayerProfile $p, int $i) => [
                'rank' => $i + 1,
                'user_id' => $p->user_id,
                'name' => $p->display_name ?? $p->user?->name,
                'avatar' => Avatars::for($p->user?->avatar, (int) $p->user_id),
                'games_played' => $p->games_played,
                'games_won' => $p->games_won,
                'total_score' => $p->total_score,
                'win_rate' => $p->games_played ? round($p->games_won / $p->games_played * 100, 1) : 0,
            ]);

        return response()->json(['data' => $rows]);
    }

    public function notifications(Request $request, MaintenanceService $maintenance): JsonResponse
    {
        $items = $request->user()->notifications()->latest()->limit(50)->get(['id', 'type', 'data', 'read_at', 'created_at']);

        // Pinned above the player's own notifications: the System announcement (Admin → Settings →
        // Lobby announcement) and, while maintenance is on, the Maintenance announcement.
        $status = $maintenance->status();

        return response()->json(['data' => $items, 'meta' => [
            'unread' => $request->user()->unreadNotifications()->count(),
            'announcement' => SystemSetting::get('lobby_announcement') ?: null,
            'maintenance' => $status['mode'] === MaintenanceMode::Off->value ? null : [
                'label' => $status['label'],
                'message' => SystemSetting::get('maintenance_message') ?: ($status['game_blocked']
                    ? 'The game is closed for maintenance. Please check back soon.'
                    : 'Chips loads, withdrawals and other transactions are paused for maintenance. You can still play.'),
                'game_blocked' => $status['game_blocked'],
                'transactions_blocked' => $status['transactions_blocked'],
                'changed_at' => $status['changed_at'],
            ],
        ]]);
    }

    /** POST /notifications/{id}/read — mark one of your own notifications read; returns the new unread count. */
    public function markNotificationRead(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()->notifications()->whereKey($id)->firstOrFail();
        $notification->markAsRead();

        return response()->json(['data' => ['id' => $notification->id, 'read_at' => $notification->read_at], 'meta' => ['unread' => $request->user()->unreadNotifications()->count()]]);
    }

    public function markNotificationsRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return response()->json(['message' => 'Notifications marked as read.']);
    }
}
