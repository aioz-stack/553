<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameSessionResource;
use App\Http\Resources\UserResource;
use App\Models\GameSession;
use App\Models\PlayerProfile;
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

    public function updatePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password:sanctum'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
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
