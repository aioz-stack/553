<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\TableStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\RoomRequest;
use App\Http\Resources\RoomResource;
use App\Models\GameRoom;
use App\Models\GameTable;
use App\Services\Audit\AuditLogger;
use App\Services\Game\TableService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Room configuration. Edits never affect running or completed games:
 * every session stores its own configuration snapshot.
 */
class RoomController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('manage_rooms'), 403);

        return RoomResource::collection(GameRoom::query()
            ->with(['tables' => fn ($q) => $q->where('status', '!=', 'CLOSED')->withCount('players')])
            ->latest('id')->paginate(50));
    }

    public function store(RoomRequest $request): JsonResponse
    {
        $room = GameRoom::create($request->toAttributes() + ['created_by' => $request->user()->id])->refresh();
        AuditLogger::log($request->user(), 'room.create', $room, null, $room->only(['name', 'currency', 'entry_amount', 'payout_mode']));

        return response()->json(['data' => (new RoomResource($room))->resolve($request)], 201);
    }

    public function update(RoomRequest $request, GameRoom $room): RoomResource
    {
        $old = $room->only(['name', 'entry_amount', 'payout_mode', 'platform_fee_bps', 'tie_handling', 'status']);
        $attributes = $request->toAttributes();
        unset($attributes['slug']);
        $room->update($attributes);

        AuditLogger::log($request->user(), 'room.update', $room, $old, $room->only(array_keys($old)));

        return new RoomResource($room);
    }

    public function tables(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('manage_games'), 403);

        $tables = GameTable::query()->with(['room:id,name,currency', 'players.user:id,name,username', 'currentSession:id,status,arrangement_deadline'])
            ->where('status', '!=', TableStatus::Closed->value)
            ->latest('id')->limit(200)->get()
            ->map(fn (GameTable $t) => [
                'id' => $t->id,
                'status' => $t->status->value,
                'room' => $t->room?->only(['id', 'name']),
                'currency' => $t->room?->currency->value,
                'players' => $t->players->map(fn ($p) => ['user_id' => $p->user_id, 'username' => $p->user->username, 'seat' => $p->seat, 'is_ready' => $p->is_ready, 'is_connected' => $p->is_connected]),
                'session' => $t->currentSession ? ['id' => $t->currentSession->id, 'status' => $t->currentSession->status->value, 'deadline' => $t->currentSession->arrangement_deadline?->toIso8601String()] : null,
                'created_at' => $t->created_at->toIso8601String(),
            ]);

        return response()->json(['data' => $tables]);
    }

    public function closeTable(Request $request, GameTable $table, TableService $tables): JsonResponse
    {
        abort_unless($request->user()->can('manage_games'), 403);
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);
        $tables->close($table, $data['reason']);
        AuditLogger::log($request->user(), 'table.close', $table, null, $data);

        return response()->json(['message' => 'Table closed and entries refunded.']);
    }
}
