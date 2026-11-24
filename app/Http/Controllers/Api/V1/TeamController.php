<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Agent\TeamService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Commission wallet (read only) and Team Overview (Administrators, Incorporators and Master Agents;
 * routes are limited to those roles and the service checks again). Converting commission into the
 * wallet was retired.
 */
class TeamController extends Controller
{
    public function __construct(private readonly TeamService $team) {}

    public function commission(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->team->commission($request->user())]);
    }

    public function overview(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->team->overview($request->user())]);
    }
}
