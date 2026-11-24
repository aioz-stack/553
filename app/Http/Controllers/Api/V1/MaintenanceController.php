<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\MaintenanceMode;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\System\MaintenanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * GET status (public: the mobile game needs it before sign-in) and the Admin Panel's
 * Maintenance control (GET / PUT admin/maintenance — Super Admin and Administrators only).
 */
class MaintenanceController extends Controller
{
    public function __construct(private readonly MaintenanceService $maintenance) {}

    public function status(): JsonResponse
    {
        return response()->json(['data' => $this->maintenance->status()]);
    }

    public function show(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => $this->maintenance->status(),
            'meta' => [
                'modes' => collect(MaintenanceMode::cases())->map(fn (MaintenanceMode $m) => MaintenanceService::present($m) + ['value' => $m->value])->values(),
                'history' => AuditLog::query()->with('actor:id,username')->where('action', 'maintenance.mode')->latest('id')->limit(10)->get()
                    ->map(fn (AuditLog $l) => [
                        'from' => $l->old_values['mode'] ?? null,
                        'to' => $l->new_values['mode'] ?? null,
                        'by' => $l->actor?->username,
                        'at' => $l->created_at?->toIso8601String(),
                    ]),
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['mode' => ['required', Rule::enum(MaintenanceMode::class)]]);
        $status = $this->maintenance->set($request->user(), MaintenanceMode::from($data['mode']));

        return response()->json(['message' => "Maintenance set to {$status['label']}.", 'data' => $status]);
    }

    private function authorizeAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless($user && ($user->isSuperAdmin() || $user->isAdministrator()), 403);
    }
}
