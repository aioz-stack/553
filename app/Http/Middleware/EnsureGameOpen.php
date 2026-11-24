<?php

namespace App\Http\Middleware;

use App\Services\System\MaintenanceService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Game routes (lobby, rooms, tables, games, Single Player) are closed while the maintenance
 * mode blocks the game (Full Maintenance, Mobile Game). The app reacts to the 503
 * "maintenance" answer by showing the maintenance screen.
 */
class EnsureGameOpen
{
    public function __construct(private readonly MaintenanceService $maintenance) {}

    public function handle(Request $request, Closure $next): Response
    {
        $status = $this->maintenance->status();

        if ($status['game_blocked']) {
            return response()->json([
                'message' => 'Pusoy553 is currently under maintenance. Please check back soon!',
                'error' => 'maintenance',
                'maintenance' => $status,
            ], 503);
        }

        return $next($request);
    }
}
