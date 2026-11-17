<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameSessionResource;
use App\Models\GameSession;
use App\Services\Game\GameEngine;
use App\Services\Game\GameStatePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Staff view of game sessions. Staff never see private cards before the
 * reveal stage either — the presenter applies the same visibility rules.
 */
class GameController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('manage_games') || $request->user()->can('view_reports'), 403);

        return GameSessionResource::collection(GameSession::query()->with('results.user:id,name')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('room_id'), fn ($q) => $q->where('game_room_id', $request->integer('room_id')))
            ->latest('id')->paginate(min((int) $request->integer('per_page', 25), 100))->withQueryString());
    }

    public function show(Request $request, GameSession $session, GameStatePresenter $presenter): JsonResponse
    {
        $this->authorize('view', $session);

        return response()->json(['data' => $presenter->session($session, $request->user()) + [
            'settlement' => $session->settlement,
        ]]);
    }

    public function cancel(Request $request, GameSession $session, GameEngine $engine): JsonResponse
    {
        $this->authorize('cancel', $session);
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);
        $engine->cancel($session, $request->user(), $data['reason']);

        return response()->json(['message' => 'Game cancelled and all entries refunded.']);
    }

    /**
     * Retry an interrupted reveal/scoring/settlement.
     */
    public function retry(Request $request, GameSession $session, GameEngine $engine): JsonResponse
    {
        $this->authorize('cancel', $session);
        $engine->resolve($session);

        return response()->json(['data' => ['status' => $session->refresh()->status->value]]);
    }
}
