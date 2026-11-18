<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Currency;
use App\Http\Controllers\Controller;
use App\Http\Resources\CommissionResource;
use App\Models\AgentCommission;
use App\Models\AgentCommissionRule;
use App\Services\Agent\CommissionService;
use App\Services\Audit\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class CommissionController extends Controller
{
    public function __construct(private readonly CommissionService $commissions) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('manage_commissions'), 403);

        return CommissionResource::collection(AgentCommission::query()->with(['agent.user', 'player'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('agent_id'), fn ($q) => $q->where('agent_id', $request->integer('agent_id')))
            ->latest('id')->paginate(min((int) $request->integer('per_page', 25), 100))->withQueryString());
    }

    public function approve(Request $request, AgentCommission $commission): CommissionResource
    {
        return new CommissionResource($this->commissions->approve($request->user(), $commission->load('agent'))->load(['agent.user', 'player']));
    }

    public function reject(Request $request, AgentCommission $commission): CommissionResource
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:255']]);

        return new CommissionResource($this->commissions->reject($request->user(), $commission->load('agent'), $data['note'] ?? null));
    }

    public function reverse(Request $request, AgentCommission $commission): CommissionResource
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:255']]);

        return new CommissionResource($this->commissions->reverse($request->user(), $commission->load('agent'), $data['note']));
    }

    public function rules(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('manage_commissions'), 403);

        return response()->json(['data' => AgentCommissionRule::query()->with('agent.user:id,name')->latest('id')->get()]);
    }

    /**
     * Only Super Admin sets commission rates. A new rule deactivates the
     * previous rule for the same agent/currency; history is kept.
     */
    public function storeRule(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);

        $data = $request->validate([
            'agent_id' => ['nullable', 'integer', 'exists:agents,id'],
            'currency' => ['nullable', Rule::enum(Currency::class)->only(Currency::multiplayer())],
            'rate_bps' => ['required', 'integer', 'min:0', 'max:10000'],
        ]);

        AgentCommissionRule::query()
            ->where('agent_id', $data['agent_id'] ?? null)
            ->where('currency', $data['currency'] ?? null)
            ->update(['is_active' => false]);

        $rule = AgentCommissionRule::create($data + ['is_active' => true, 'created_by' => $request->user()->id]);
        AuditLogger::log($request->user(), 'commission.rule', $rule, null, $data);

        return response()->json(['data' => $rule], 201);
    }
}
