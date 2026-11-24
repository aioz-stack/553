<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\LoaderPermission;
use App\Http\Controllers\Api\V1\Admin\PanelController;
use App\Models\AgentCommission;
use App\Models\AgentPayoutRequest;
use App\Models\AuditLog;
use App\Models\ChipLoad;
use App\Models\WalletTransaction;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Loader Panel (Loader Accounts): the Admin Panel's Load Logs, Commission Logs, Commission
 * Withdrawal and Reset Password screens — the same code — and nothing else. Every route also
 * requires the matching Loader permission; loads use the employer Admin's Chips (ChipLoadService)
 * and every action is recorded against the Loader. Admin-only routes are simply not registered.
 */
class LoaderPanelController extends PanelController
{
    public function overview(Request $request): JsonResponse
    {
        $me = $request->user();
        $employer = $me->employer();
        $can = fn (LoaderPermission $p) => $me->hasLoaderPermission($p);
        $loads = ChipLoad::query()->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');

        return response()->json(['data' => [
            'me' => ['id' => $me->id, 'username' => $me->username, 'name' => $me->name, 'role' => 'loader', 'role_label' => 'Loader Account', 'is_super_admin' => false],
            'permissions' => array_values(array_filter(LoaderPermission::values(), fn (string $p) => $can(LoaderPermission::from($p)))),
            'employer' => $employer ? ['username' => $employer->username, 'chips' => Points::decimal($this->chips->chipsBalance($employer))] : null,
            'loads' => $can(LoaderPermission::Loads) ? [
                'total' => (int) $loads->sum(),
                'completed' => (int) ($loads['completed'] ?? 0),
                'pending' => (int) ($loads['pending'] ?? 0),
                'rejected' => (int) ($loads['rejected'] ?? 0),
                'processed_by_me' => ChipLoad::query()->where('processed_by', $me->id)->count(),
            ] : null,
            'commissions' => $can(LoaderPermission::Commissions) ? [
                'total' => AgentCommission::query()->count(),
                'withdrawals_pending' => AgentPayoutRequest::query()->where('status', 'pending')->count(),
                'withdrawals_pending_amount' => Points::decimal((int) AgentPayoutRequest::query()->where('status', 'pending')->sum('amount')),
                'conversions' => WalletTransaction::query()->where('type', 'COMMISSION_CONVERSION')->count(),
            ] : null,
            'pending_users' => 0,
            'banned_users' => 0,
            'recent' => AuditLog::query()->where('actor_id', $me->id)->latest('id')->limit(10)->get()->map(fn (AuditLog $l) => [
                'action' => $l->action,
                'details' => collect($l->new_values ?? [])->except(['password'])->all(),
                'at' => $l->created_at?->toIso8601String(),
            ]),
        ]]);
    }

    /** Account search for loading and password resets: agents and players only, any status. */
    public function accounts(Request $request): JsonResponse
    {
        $request->merge(['kind' => 'all']);

        return parent::accounts($request);
    }
}
