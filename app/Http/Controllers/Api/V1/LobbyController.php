<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\GameMode;
use App\Http\Controllers\Controller;
use App\Models\GameRoom;
use App\Services\Game\BankerMatchService;
use App\Services\Game\LobbyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Multiplayer Lobby API (the 553 Lobby). Rules live in LobbyService; seating,
 * readiness, leaving and the game itself use the existing table / game endpoints.
 */
class LobbyController extends Controller
{
    public function __construct(private readonly LobbyService $lobbies) {}

    /** GET /lobbies?tab=all|public|private&search=&page= — 5 per page, counts per tab. */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tab' => ['nullable', Rule::in(['all', 'public', 'private'])],
            'search' => ['nullable', 'string', 'max:60'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        return response()->json($this->lobbies->list($request->user(), $data['tab'] ?? 'all', $data['search'] ?? null, (int) ($data['page'] ?? 1)));
    }

    /** POST /lobbies — create a lobby; you take seat 1 as its owner. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:30'],
            'password' => ['nullable', 'string', 'min:4', 'max:32'],
            'game_mode' => ['required', Rule::in([GameMode::Banker->value, GameMode::RoundBank->value])],
            'min_entry' => ['required', 'integer', Rule::in(LobbyService::MIN_ENTRIES)],
            'preparation_seconds' => ['required', 'integer', Rule::in(LobbyService::PREPARATION_SECONDS)],
        ], [
            'name.required' => 'Enter a lobby name.',
            'name.max' => 'The lobby name can be at most 30 characters.',
            'password.min' => 'A lobby password needs at least 4 characters.',
        ]);

        $room = $this->lobbies->create($request->user(), $data);

        return response()->json(['data' => $this->lobbies->show($request->user(), $room->refresh())], 201);
    }

    /** GET /lobbies/{room} — the waiting room: lobby details and its four seats. */
    public function show(Request $request, GameRoom $room): JsonResponse
    {
        return response()->json(['data' => $this->lobbies->show($request->user(), $room)]);
    }

    /** POST /lobbies/{room}/join — private lobbies need the password. */
    public function join(Request $request, GameRoom $room): JsonResponse
    {
        $data = $request->validate(['password' => ['nullable', 'string', 'max:32']]);
        $this->lobbies->join($request->user(), $room, $data['password'] ?? null);

        return response()->json(['data' => $this->lobbies->show($request->user(), $room->refresh())], 201);
    }

    /** POST /lobbies/quick-join — the best open public lobby you can afford. */
    public function quickJoin(Request $request): JsonResponse
    {
        $seat = $this->lobbies->quickJoin($request->user());

        return response()->json(['data' => $this->lobbies->show($request->user(), $seat->table->room)], 201);
    }

    /** POST /lobbies/{room}/start — owner only; four players, everyone else ready. */
    public function start(Request $request, GameRoom $room, BankerMatchService $match): JsonResponse
    {
        $table = $this->lobbies->start($request->user(), $room, $match);

        return response()->json(['data' => ['table_id' => $table->id, 'status' => $table->status->value]]);
    }

    /** PATCH /lobbies/{room} — owner only, before the game: name, password, preparation time. */
    public function update(Request $request, GameRoom $room): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:30'],
            'password' => ['sometimes', 'nullable', 'string', 'min:4', 'max:32'],
            'preparation_seconds' => ['sometimes', 'integer', Rule::in(LobbyService::PREPARATION_SECONDS)],
        ]);
        $this->lobbies->update($request->user(), $room, $data);

        return response()->json(['data' => $this->lobbies->show($request->user(), $room->refresh())]);
    }

    /** POST /lobbies/{room}/kick — owner only, before the game. */
    public function kick(Request $request, GameRoom $room): JsonResponse
    {
        $data = $request->validate(['user_id' => ['required', 'integer']]);
        $this->lobbies->kick($request->user(), $room, (int) $data['user_id']);

        return response()->json(['data' => $this->lobbies->show($request->user(), $room->refresh())]);
    }
}
