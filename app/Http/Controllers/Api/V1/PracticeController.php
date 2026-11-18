<?php

namespace App\Http\Controllers\Api\V1;

use App\Game\ArrangementPreview;
use App\Game\AutoArranger;
use App\Http\Controllers\Controller;
use App\Http\Requests\SubmitArrangementRequest;
use App\Models\PracticeGame;
use App\Models\PracticeMatch;
use App\Services\Game\GoldService;
use App\Services\Game\PracticeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Single Player — Round Bank Pusoy vs one bot (12 rounds, alternating
 * banker). Matches and rounds are private to their owner (others get 404).
 */
class PracticeController extends Controller
{
    /** Difficulty levels (minimum gold, bet options) and whether the player qualifies. */
    public function tiers(Request $request, PracticeService $practice, GoldService $gold): JsonResponse
    {
        return response()->json([
            'data' => $practice->tiers($request->user()),
            'meta' => ['rounds' => (int) config('pusoy.practice.rounds', 12), 'wagering' => true, 'gold_wallet' => $gold->state($request->user())],
        ]);
    }

    /** Start a new 12-round match at a difficulty level. */
    public function startMatch(Request $request, PracticeService $practice): JsonResponse
    {
        $data = $request->validate([
            'tier' => ['required', 'string', Rule::in(array_keys((array) config('pusoy.practice.tiers', [])))],
        ]);

        $match = $practice->startMatch($request->user(), $data['tier']);

        return response()->json(['data' => $practice->presentMatch($match)], 201);
    }

    /** The player's active match (to resume), or null. */
    public function currentMatch(Request $request, PracticeService $practice): JsonResponse
    {
        $match = $practice->activeMatch($request->user());

        return response()->json(['data' => $match ? $practice->presentMatch($match) : null]);
    }

    public function showMatch(Request $request, PracticeMatch $practiceMatch, PracticeService $practice): JsonResponse
    {
        abort_unless($practiceMatch->user_id === $request->user()->id, 404);

        return response()->json(['data' => $practice->presentMatch($practiceMatch)]);
    }

    /** Place the round's bet and deal the next round. */
    public function deal(Request $request, PracticeMatch $practiceMatch, PracticeService $practice): JsonResponse
    {
        abort_unless($practiceMatch->user_id === $request->user()->id, 404);

        $data = $request->validate([
            'bet' => ['nullable', 'integer', 'min:1'],
            'request_id' => ['nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9-]+$/'],
        ]);

        $game = $practice->deal($request->user(), $practiceMatch, isset($data['bet']) ? (int) $data['bet'] : null, $data['request_id'] ?? null);

        return response()->json(['data' => $practice->present($game)], $game->wasRecentlyCreated ? 201 : 200);
    }

    public function show(Request $request, PracticeGame $practiceGame, PracticeService $practice): JsonResponse
    {
        $this->owned($request, $practiceGame);

        return response()->json(['data' => $practice->present($practiceGame)]);
    }

    public function preview(Request $request, PracticeGame $practiceGame): JsonResponse
    {
        $this->owned($request, $practiceGame);

        $data = $request->validate([
            'front' => ['array', 'max:3'], 'front.*' => ['string', 'size:2'],
            'middle' => ['array', 'max:5'], 'middle.*' => ['string', 'size:2'],
            'back' => ['array', 'max:5'], 'back.*' => ['string', 'size:2'],
        ]);

        return response()->json(['data' => ArrangementPreview::evaluate($practiceGame->hands[PracticeService::PLAYER_SEAT], $data)]);
    }

    /** "Autoplay Arrange": the server's non-fouling arrangement of the player's 13 cards. Nothing is submitted. */
    public function suggest(Request $request, PracticeGame $practiceGame): JsonResponse
    {
        $this->owned($request, $practiceGame);
        abort_unless($practiceGame->status === PracticeGame::ARRANGING, 409, 'This round is already finished.');

        $a = AutoArranger::arrange($practiceGame->hands[PracticeService::PLAYER_SEAT]);

        return response()->json(['data' => ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back, 'labels' => $a->labels()]]);
    }

    public function submit(SubmitArrangementRequest $request, PracticeGame $practiceGame, PracticeService $practice): JsonResponse
    {
        $this->owned($request, $practiceGame);

        $game = $practice->submit($request->user(), $practiceGame, $request->input('front'), $request->input('middle'), $request->input('back'));

        return response()->json(['message' => 'Round settled.', 'data' => $practice->present($game)], 201);
    }

    /** Declared Luck: the server checks the dealt cards; success settles the round. */
    public function lucky(Request $request, PracticeGame $practiceGame, PracticeService $practice): JsonResponse
    {
        $this->owned($request, $practiceGame);

        $game = $practice->declareLucky($request->user(), $practiceGame);

        return response()->json(['message' => 'Declared Luck: '.($game->lucky_type ? \App\Game\LuckyHand::LABELS[$game->lucky_type] : '').'!', 'data' => $practice->present($game)], 201);
    }

    // ------------------------------------------------------------------ Gold Wallet (Single Player only)

    /** Gold, Gold Points and whether the player is Out of Gold (and may claim the free Gold Points). */
    public function gold(Request $request, GoldService $gold): JsonResponse
    {
        return response()->json(['data' => $gold->state($request->user())]);
    }

    /** Claim the free Gold Points: only when Out of Gold, credited once however often it is pressed. */
    public function claimGoldPoints(Request $request, GoldService $gold): JsonResponse
    {
        $claim = $gold->claim($request->user());

        return response()->json([
            'message' => $claim['created'] ? number_format(GoldService::claimAmount()).' Gold Points claimed!' : 'You already claimed these Gold Points.',
            'data' => $gold->state($request->user()) + ['reference' => $claim['transaction']->reference],
        ], $claim['created'] ? 201 : 200);
    }

    /** Convert Gold Points into Gold, one way, 1:1 (all of them when no amount is given). */
    public function convertGoldPoints(Request $request, GoldService $gold): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['nullable', 'integer', 'min:1', 'max:1000000000'],
            'request_id' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9-]+$/'],
        ]);

        $minor = $gold->convert($request->user(), isset($data['amount']) ? (int) $data['amount'] : null, $data['request_id']);

        return response()->json([
            'message' => \App\Support\Points::format($minor).' Gold Points converted to Gold.',
            'data' => $gold->state($request->user()) + ['converted' => \App\Support\Points::decimal($minor)],
        ]);
    }

    private function owned(Request $request, PracticeGame $game): void
    {
        abort_unless($game->user_id === $request->user()->id, 404);
    }
}
