<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\TableStatus;
use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Friendship;
use App\Models\GameInvitation;
use App\Models\GamePlayer;
use App\Models\User;
use App\Notifications\FriendRequest;
use App\Notifications\RoomInvitation;
use App\Services\Game\TableService;
use App\Support\Level;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Friends list: requests by username, accept/decline, online status and
 * inviting a friend to the table you are seated at. Shows names, level and
 * status only — never balances.
 */
class FriendController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();
        $rows = Friendship::query()->involving($me->id)->with(['user.profile', 'friend.profile'])->latest('id')->get();
        $otherIds = $rows->map(fn (Friendship $f) => $f->otherId($me->id))->all();

        $playing = GamePlayer::query()->with('table.room:id,name')->whereIn('user_id', $otherIds)
            ->whereHas('table', fn ($q) => $q->where('status', '!=', TableStatus::Closed->value))
            ->get()->keyBy('user_id');

        $present = function (Friendship $f) use ($me, $playing) {
            $other = $f->user_id === $me->id ? $f->friend : $f->user;
            $seat = $playing[$other->id] ?? null;

            return [
                'id' => $f->id,
                'user_id' => $other->id,
                'username' => $other->username,
                'name' => $other->profile?->display_name ?? $other->name,
                'avatar' => $other->avatarId(),
                'level' => Level::fromXp((int) ($other->profile?->xp ?? 0))['level'],
                'online' => $other->last_seen_at !== null && $other->last_seen_at->gt(now()->subSeconds((int) config('pusoy.online_seconds', 120))),
                'last_seen_at' => $other->last_seen_at?->toIso8601String(),
                'in_game' => $seat !== null,
                'room_name' => $seat?->table?->room?->name,
                'status' => $f->status,
                'direction' => $f->user_id === $me->id ? 'outgoing' : 'incoming',
            ];
        };

        $accepted = $rows->where('status', 'accepted')->map($present)->sortByDesc('online')->values();

        return response()->json(['data' => [
            'friends' => $accepted,
            'incoming' => $rows->where('status', 'pending')->where('friend_id', $me->id)->map($present)->values(),
            'outgoing' => $rows->where('status', 'pending')->where('user_id', $me->id)->map($present)->values(),
            'online_count' => $accepted->where('online', true)->count(),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['username' => ['required', 'string', 'max:64']]);
        $me = $request->user();
        $other = User::query()->where('username', $data['username'])->first();

        if ($other === null || ! $other->isPlayer()) {
            throw new BusinessRuleException('No player with that username.', 404, 'not_found');
        }

        if ($other->id === $me->id) {
            throw new BusinessRuleException('You cannot add yourself.', 422, 'invalid');
        }

        $existing = Friendship::query()->between($me->id, $other->id)->first();

        if ($existing?->status === 'accepted') {
            throw new BusinessRuleException('You are already friends.', 409, 'already_friends');
        }

        // They already asked you: adding them back accepts.
        if ($existing && $existing->user_id === $other->id) {
            $existing->forceFill(['status' => 'accepted', 'accepted_at' => now()])->save();
            $other->notify(new FriendRequest($me, accepted: true));

            return response()->json(['message' => 'You are now friends.', 'data' => ['id' => $existing->id, 'status' => 'accepted']], 201);
        }

        if ($existing) {
            throw new BusinessRuleException('Friend request already sent.', 409, 'already_requested');
        }

        $friendship = Friendship::create(['user_id' => $me->id, 'friend_id' => $other->id, 'status' => 'pending']);
        $other->notify(new FriendRequest($me));

        return response()->json(['message' => 'Friend request sent.', 'data' => ['id' => $friendship->id, 'status' => 'pending']], 201);
    }

    public function accept(Request $request, Friendship $friendship): JsonResponse
    {
        abort_unless($friendship->friend_id === $request->user()->id && $friendship->status === 'pending', 404);

        $friendship->forceFill(['status' => 'accepted', 'accepted_at' => now()])->save();
        $friendship->user->notify(new FriendRequest($request->user(), accepted: true));

        return response()->json(['message' => 'Friend request accepted.']);
    }

    public function destroy(Request $request, Friendship $friendship): JsonResponse
    {
        abort_unless(in_array($request->user()->id, [$friendship->user_id, $friendship->friend_id], true), 404);
        $friendship->delete();

        return response()->json(['message' => 'Removed.']);
    }

    /**
     * Invite a friend to the room of the table you are seated at.
     */
    public function invite(Request $request, User $user, TableService $tables): JsonResponse
    {
        $me = $request->user();

        abort_unless(Friendship::query()->between($me->id, $user->id)->where('status', 'accepted')->exists(), 404);

        $seat = $tables->activeSeat($me) ?? throw new BusinessRuleException('Sit at a table first, then invite friends.', 409, 'not_seated');
        $room = $seat->table->room;

        GameInvitation::query()->updateOrCreate(
            ['game_room_id' => $room->id, 'invitee_id' => $user->id],
            ['inviter_id' => $me->id, 'status' => 'pending', 'expires_at' => now()->addDay()],
        );

        $user->notify(new RoomInvitation($room, $me));

        return response()->json(['message' => "Invited {$user->username} to {$room->name}."], 201);
    }
}
