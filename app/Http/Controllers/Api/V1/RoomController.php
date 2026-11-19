<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Currency;
use App\Enums\GameMode;
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
use Illuminate\Validation\Rule;

class RoomController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $rooms = GameRoom::query()
            ->active()
            ->where(fn ($q) => $q->where('visibility', RoomVisibility::Public->value)->orWhere('owner_id', $request->user()->id))
            ->when($request->filled('currency'), fn ($q) => $q->where('currency', $request->input('currency')))
            ->when($request->filled('game_mode'), fn ($q) => $q->where('game_mode', $request->input('game_mode')))
            ->with(['tables' => fn ($q) => $q->where('status', '!=', 'CLOSED')->withCount('players'), 'owner:id,username,name'])
            ->orderBy('currency')->orderByRaw('owner_id IS NOT NULL')->orderBy('entry_amount')
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
     * Players create private Chips rooms with the platform's default rules;
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
            'currency' => Currency::CH,
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

    /**
     * Host a banker-mode table (Chips). The host is seated immediately and
     * is the table creator, so in Banker Mode they bank every round.
     * Room rules (settlement table, fees = 0, timers) are platform defaults.
     */
    public function host(Request $request, TableService $tables, GameStatePresenter $presenter): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'game_mode' => ['required', Rule::in([GameMode::Banker->value, GameMode::RoundBank->value])],
            'min_bet' => ['required', 'regex:/^\d{1,9}(\.\d{1,2})?$/'],
            'max_bet' => ['nullable', 'regex:/^\d{1,9}(\.\d{1,2})?$/'],
            'visibility' => ['nullable', Rule::enum(RoomVisibility::class)],
        ]);

        if (! $request->user()->isPlayer()) {
            throw new BusinessRuleException('Only players can host tables.', 403, 'forbidden');
        }

        if ($tables->activeSeat($request->user())) {
            throw new BusinessRuleException('Leave your current table before hosting a new one.', 409, 'already_seated');
        }

        $min = max(100, Points::toMinor($data['min_bet']));
        $max = isset($data['max_bet']) ? Points::toMinor($data['max_bet']) : null;

        if ($max !== null && $max < $min) {
            throw new BusinessRuleException('Maximum bet must be at least the minimum bet.', 422, 'invalid_bet');
        }

        $room = GameRoom::create([
            'name' => $data['name'],
            'slug' => Str::slug($data['name']).'-'.Str::lower(Str::random(6)),
            'description' => GameMode::from($data['game_mode'])->label().' hosted by '.$request->user()->username,
            'currency' => Currency::CH,
            'entry_amount' => $min,
            'max_bet' => $max,
            'payout_mode' => 'winner_takes_all',
            'game_mode' => $data['game_mode'],
            'rounds_total' => (int) config('pusoy.banker.rounds', 12),
            'platform_fee_bps' => 0,
            'arrangement_seconds' => config('pusoy.game.default_arrangement_seconds'),
            'betting_seconds' => config('pusoy.banker.default_betting_seconds'),
            'min_players' => 2,
            'tie_handling' => 'split_equally',
            'timeout_policy' => 'auto_arrange',
            'visibility' => $data['visibility'] ?? RoomVisibility::Public->value,
            'status' => RoomStatus::Active,
            'invite_code' => strtoupper(Str::random(8)),
            'owner_id' => $request->user()->id,
            'created_by' => $request->user()->id,
        ]);

        $seat = $tables->join($request->user(), $room);

        return response()->json(['data' => $presenter->table($seat->table->refresh(), $request->user())], 201);
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
