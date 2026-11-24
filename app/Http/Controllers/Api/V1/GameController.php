<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\GameStatus;
use App\Game\ArrangementPreview;
use App\Http\Controllers\Controller;
use App\Http\Requests\SubmitArrangementRequest;
use App\Models\GameCard;
use App\Models\GameSession;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use App\Services\Game\GameStatePresenter;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GameController extends Controller
{
    /**
     * Full state for the viewer (also the reconnection / recovery endpoint).
     */
    public function show(Request $request, GameSession $session, GameStatePresenter $presenter): JsonResponse
    {
        $this->authorize('view', $session);

        return response()->json(['data' => $presenter->session($session, $request->user())]);
    }

    public function cards(Request $request, GameSession $session): JsonResponse
    {
        $this->authorize('play', $session);

        $card = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $request->user()->id)->firstOrFail();

        return response()->json(['data' => ['session_id' => $session->id, 'cards' => $card->cards]]);
    }

    public function submit(SubmitArrangementRequest $request, GameSession $session, GameEngine $engine, GameStatePresenter $presenter): JsonResponse
    {
        $this->authorize('play', $session);

        $engine->submit($request->user(), $session, $request->input('front'), $request->input('middle'), $request->input('back'));

        return response()->json([
            'message' => 'Arrangement submitted.',
            'data' => $presenter->session($session->refresh(), $request->user()),
        ], 201);
    }

    /**
     * PUT /games/{session}/draft — save your current arrangement while you arrange (nothing is
     * submitted). Only a valid arrangement replaces the saved one; at the timer's end the saved one
     * is submitted for you, even if you went offline or left.
     */
    public function draft(Request $request, GameSession $session, GameEngine $engine): JsonResponse
    {
        $this->authorize('play', $session);

        $data = $request->validate([
            'front' => ['required', 'array', 'max:3'], 'front.*' => ['string', 'size:2'],
            'middle' => ['required', 'array', 'max:5'], 'middle.*' => ['string', 'size:2'],
            'back' => ['required', 'array', 'max:5'], 'back.*' => ['string', 'size:2'],
        ]);

        $saved = $engine->saveDraft($request->user(), $session, $data['front'], $data['middle'], $data['back']);

        return response()->json(['data' => ['saved' => $saved]]);
    }

    /**
     * Server-side evaluation of a partial or full arrangement for UI hints
     * (hand names, foul warning). Never stores anything; clients do not
     * evaluate hands themselves.
     */
    public function preview(Request $request, GameSession $session): JsonResponse
    {
        $this->authorize('play', $session);

        $data = $request->validate([
            'front' => ['array', 'max:3'], 'front.*' => ['string', 'size:2'],
            'middle' => ['array', 'max:5'], 'middle.*' => ['string', 'size:2'],
            'back' => ['array', 'max:5'], 'back.*' => ['string', 'size:2'],
        ]);

        $dealt = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $request->user()->id)->value('cards') ?? [];

        return response()->json(['data' => ArrangementPreview::evaluate($dealt, $data)]);
    }

    /**
     * Banker rounds: place this round's bet (minor-unit validation server side).
     */
    public function bet(Request $request, GameSession $session, BankerMatchService $match, GameStatePresenter $presenter): JsonResponse
    {
        $this->authorize('bet', $session);
        $data = $request->validate(['amount' => ['required', 'regex:/^\d{1,9}(\.\d{1,2})?$/']]);

        $match->placeBet($request->user(), $session, Points::toMinor($data['amount']));

        return response()->json([
            'message' => 'Bet placed.',
            'data' => $presenter->session($session->refresh(), $request->user()),
        ], 201);
    }

    /**
     * Declare a Lucky Hand. The server validates the dealt cards; the hand is
     * locked in as this round's submission.
     */
    public function lucky(Request $request, GameSession $session, BankerMatchService $match, GameEngine $engine, GameStatePresenter $presenter): JsonResponse
    {
        $this->authorize('play', $session);

        $match->declareLucky($request->user(), $session, $engine);

        return response()->json([
            'message' => 'Lucky Hand declared!',
            'data' => $presenter->session($session->refresh(), $request->user()),
        ], 201);
    }

    public function results(Request $request, GameSession $session, GameStatePresenter $presenter): JsonResponse
    {
        $this->authorize('view', $session);

        if ($session->status !== GameStatus::Completed) {
            return response()->json(['message' => 'Results are not available yet.', 'data' => ['status' => $session->status->value]], 409);
        }

        $state = $presenter->session($session, $request->user());

        return response()->json(['data' => [
            'session_id' => $session->id,
            'results' => $state['results'],
            'arrangements' => $state['arrangements'],
            'server_seed' => $state['server_seed'],
            'deck_commitment' => $state['deck_commitment'],
        ]]);
    }
}
