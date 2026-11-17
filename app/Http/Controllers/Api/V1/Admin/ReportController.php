<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Models\AuditLog;
use App\Models\SystemSetting;
use App\Services\Audit\AuditLogger;
use App\Services\Reports\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ReportController extends Controller
{
    public function overview(Request $request, ReportService $reports): JsonResponse
    {
        abort_unless($request->user()->can('view_reports'), 403);

        return response()->json(['data' => $reports->platformOverview()]);
    }

    public function auditLogs(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('view_audit_logs'), 403);

        return AuditLogResource::collection(AuditLog::query()->with('actor')
            ->when($request->filled('action'), fn ($q) => $q->where('action', 'like', $request->input('action').'%'))
            ->when($request->filled('actor_id'), fn ($q) => $q->where('actor_id', $request->integer('actor_id')))
            ->latest('id')->paginate(min((int) $request->integer('per_page', 25), 100))->withQueryString());
    }

    /**
     * Feature flags come from the environment (deploy-time decision) and are
     * shown read-only; other settings are stored in system_settings.
     */
    public function settings(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);

        return response()->json(['data' => [
            'features' => config('pusoy.features'),
            'game' => config('pusoy.game'),
            'settings' => SystemSetting::query()->pluck('value', 'key'),
        ]]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);

        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.maintenance_message' => ['nullable', 'string', 'max:255'],
            'settings.support_contact' => ['nullable', 'string', 'max:255'],
            'settings.lobby_announcement' => ['nullable', 'string', 'max:500'],
        ]);

        foreach ($data['settings'] as $key => $value) {
            SystemSetting::query()->updateOrCreate(['key' => $key], ['value' => $value, 'updated_by' => $request->user()->id]);
        }

        AuditLogger::log($request->user(), 'settings.update', null, null, $data['settings']);

        return response()->json(['data' => SystemSetting::query()->pluck('value', 'key')]);
    }
}
