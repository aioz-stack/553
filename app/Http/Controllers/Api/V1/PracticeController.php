<?php

namespace App\Http\Controllers\Api\V1;

use App\Game\ArrangementPreview;
use App\Http\Controllers\Controller;
use App\Http\Requests\SubmitArrangementRequest;
use App\Models\PracticeGame;
use App\Services\Game\PracticeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Single Player practice vs three server bots. No currency involved.
 * Only the owner can see or play a practice game (others get 404).
 */
class PracticeController extends Controller
{
    public function store(Request $request, PracticeService $practice): JsonResponse
    {
        $game = $practice->start($request->user());

        return response()->json(['data' => $practice->present($game)], 201);
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

    public function submit(SubmitArrangementRequest $request, PracticeGame $practiceGame, PracticeService $practice): JsonResponse
    {
        $this->owned($request, $practiceGame);

        $game = $practice->submit($request->user(), $practiceGame, $request->input('front'), $request->input('middle'), $request->input('back'));

        return response()->json(['message' => 'Arrangement submitted.', 'data' => $practice->present($game)], 201);
    }

    private function owned(Request $request, PracticeGame $game): void
    {
        abort_unless($game->user_id === $request->user()->id, 404);
    }
}
