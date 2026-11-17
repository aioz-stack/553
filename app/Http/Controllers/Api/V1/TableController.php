<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GameTable;
use App\Services\Game\GameStatePresenter;
use App\Services\Game\TableService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TableController extends Controller
{
    /**
     * Where am I seated right now? Used by clients to recover after a
     * refresh, app restart or network drop.
     */
    public function current(Request $request, TableService $tables, GameStatePresenter $presenter): JsonResponse
    {
        $seat = $tables->activeSeat($request->user());

        if ($seat === null) {
            return response()->json(['data' => null]);
        }

        $table = $seat->table;
        $data = $presenter->table($table, $request->user());

        if ($table->current_session_id) {
            $data['session'] = $presenter->session($table->currentSession, $request->user());
        }

        return response()->json(['data' => $data]);
    }

    public function show(Request $request, GameTable $table, GameStatePresenter $presenter): JsonResponse
    {
        $this->authorizeSeat($request, $table);

        return response()->json(['data' => $presenter->table($table, $request->user())]);
    }

    public function ready(Request $request, GameTable $table, TableService $tables, GameStatePresenter $presenter): JsonResponse
    {
        $data = $request->validate(['ready' => ['required', 'boolean']]);
        $this->authorizeSeat($request, $table);
        $tables->setReady($request->user(), $table, $data['ready']);
        $table->refresh();

        $payload = $presenter->table($table, $request->user());

        if ($table->current_session_id) {
            $payload['session'] = $presenter->session($table->currentSession, $request->user());
        }

        return response()->json(['data' => $payload]);
    }

    public function leave(Request $request, GameTable $table, TableService $tables): JsonResponse
    {
        $tables->leave($request->user(), $table);

        return response()->json(['message' => 'You left the table. Your entry has been refunded.']);
    }

    public function heartbeat(Request $request, GameTable $table, TableService $tables): JsonResponse
    {
        $this->authorizeSeat($request, $table);
        $tables->heartbeat($request->user(), $table);

        return response()->json(['data' => ['ok' => true, 'server_time' => now()->toIso8601String()]]);
    }

    private function authorizeSeat(Request $request, GameTable $table): void
    {
        abort_unless($table->hasPlayer($request->user()) || $request->user()->can('manage_games'), 403, 'You are not seated at this table.');
    }
}
