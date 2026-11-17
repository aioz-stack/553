<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Currency;
use App\Enums\RoomStatus;
use App\Enums\RoomVisibility;
use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Http\Resources\RoomResource;
use App\Models\GameInvitation;
use App\Models\GameRoom;
use App\Models\SystemSetting;
use App\Models\User;
use App\Notifications\RoomInvitation;
use App\Services\Game\GameStatePresenter;
use App\Services\Game\TableService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Str;

class RoomController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $rooms = GameRoom::query()
            ->active()
            ->where(fn ($q) => $q->where('visibility', RoomVisibility::Public->value)->orWhere('owner_id', $request->user()->id))
            ->when($request->filled('currency'), fn ($q) => $q->where('currency', $request->input('currency')))
            ->with(['tables' => fn ($q) => $q->where('status', '!=', 'CLOSED')->withCount('players')])
            ->orderBy('currency')->orderBy('entry_amount')
            ->get();

        return RoomResource::collection($rooms)->additional(['meta' => [
            'announcement' => SystemSetting::get('lobby_announcement'),
            'maintenance_message' => SystemSetting::get('maintenance_message'),
        ]]);
    }

    public function show(Request $request, GameRoom $room): RoomResource
    {
        abort_if($room->visibility === RoomVisibility::Private && $room->owner_id !== $request->user()->id
            && ! GameInvitation::query()->where('game_room_id', $room->id)->where('invitee_id', $request->user()->id)->exists()
            && ! $request->user()->can('manage_rooms'), 404);

        return new RoomResource($room->load(['tables' => fn ($q) => $q->where('status', '!=', 'CLOSED')->withCount('players')]));
    }

    public function join(Request $request, GameRoom $room, TableService $tables, GameStatePresenter $presenter): JsonResponse
    {
        $request->validate(['invite_code' => ['nullable', 'string', 'max:16']]);
        $seat = $tables->join($request->user(), $room, $request->input('invite_code'));

        return response()->json(['data' => $presenter->table($seat->table, $request->user())], 201);
    }

    /**
     * Players create private VC rooms with the platform's default rules;
     * the payout mode follows the platform default (players cannot choose it).
     */
    public function storePrivate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'entry_amount' => ['required', 'regex:/^\d{1,9}(\.\d{1,2})?$/'],
        ]);

        if (! $request->user()->isPlayer()) {
            throw new BusinessRuleException('Only players can create private rooms.', 403, 'forbidden');
        }

        $room = GameRoom::create([
            'name' => $data['name'],
            'slug' => Str::slug($data['name']).'-'.Str::lower(Str::random(6)),
            'description' => 'Private room',
            'currency' => Currency::VC,
            'entry_amount' => max(100, Points::toMinor($data['entry_amount'])),
            'payout_mode' => config('pusoy.private_room_payout_mode', 'winner_takes_all'),
            'platform_fee_bps' => 0,
            'arrangement_seconds' => config('pusoy.game.default_arrangement_seconds'),
            'tie_handling' => 'split_equally',
            'timeout_policy' => 'auto_arrange',
            'visibility' => RoomVisibility::Private,
            'status' => RoomStatus::Active,
            'invite_code' => strtoupper(Str::random(8)),
            'owner_id' => $request->user()->id,
            'created_by' => $request->user()->id,
        ]);

        return response()->json(['data' => (new RoomResource($room))->resolve($request)], 201);
    }

    public function invite(Request $request, GameRoom $room): JsonResponse
    {
        abort_unless($room->owner_id === $request->user()->id || $request->user()->can('manage_rooms'), 403);
        $data = $request->validate(['username' => ['required', 'string', 'exists:users,username']]);
        $invitee = User::query()->where('username', $data['username'])->firstOrFail();

        if (! $invitee->isPlayer()) {
            throw new BusinessRuleException('Only players can be invited.');
        }

        $invitation = GameInvitation::query()->updateOrCreate(
            ['game_room_id' => $room->id, 'invitee_id' => $invitee->id],
            ['inviter_id' => $request->user()->id, 'status' => 'pending', 'expires_at' => now()->addDay()],
        );

        $invitee->notify(new RoomInvitation($room, $request->user()));

        return response()->json(['data' => ['id' => $invitation->id, 'invitee' => $invitee->username, 'status' => 'pending']], 201);
    }
}
