<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameSessionResource;
use App\Http\Resources\UserResource;
use App\Models\GameSession;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Reports\ReportService;
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
        ]);

        $user = $request->user();
        $user->forceFill(['preferences' => array_merge($user->gamePreferences(), array_map(fn ($v) => is_string($v) ? $v : (bool) $v, $data))])->save();

        return response()->json(['data' => $user->gamePreferences()]);
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
        $rows = PlayerProfile::query()->with('user:id,name,username')
            ->where('games_played', '>', 0)
            ->orderByDesc('total_score')->orderByDesc('games_won')
            ->limit(min((int) $request->integer('limit', 50), 100))
            ->get()
            ->values()
            ->map(fn (PlayerProfile $p, int $i) => [
                'rank' => $i + 1,
                'user_id' => $p->user_id,
                'name' => $p->display_name ?? $p->user?->name,
                'games_played' => $p->games_played,
                'games_won' => $p->games_won,
                'total_score' => $p->total_score,
                'win_rate' => $p->games_played ? round($p->games_won / $p->games_played * 100, 1) : 0,
            ]);

        return response()->json(['data' => $rows]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $items = $request->user()->notifications()->latest()->limit(50)->get(['id', 'type', 'data', 'read_at', 'created_at']);

        return response()->json(['data' => $items, 'meta' => ['unread' => $request->user()->unreadNotifications()->count()]]);
    }

    public function markNotificationsRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return response()->json(['message' => 'Notifications marked as read.']);
    }
}
