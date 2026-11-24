<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Agent\TeamService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Convert Commission to Wallet and Team Overview (Administrators, Agents, Master Agents and
 * Master Agents; routes are limited to those roles and the service checks again).
 */
class TeamController extends Controller
{
    public function __construct(private readonly TeamService $team) {}

    public function commission(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->team->commission($request->user())]);
    }

    public function convert(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'regex:/^\d{1,13}(\.\d{1,2})?$/'],
            'request_id' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9-]+$/'],
        ]);

        $minor = $this->team->convert($request->user(), Points::toMinor($data['amount']), $data['request_id']);

        return response()->json([
            'message' => Points::format($minor).' Chips moved from commission to your wallet.',
            'data' => $this->team->commission($request->user()) + ['converted_now' => Points::decimal($minor)],
        ]);
    }

    public function overview(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->team->overview($request->user())]);
    }
}
