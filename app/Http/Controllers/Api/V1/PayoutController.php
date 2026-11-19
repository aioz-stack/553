<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Currency;
use App\Http\Controllers\Controller;
use App\Models\AgentPayoutRequest;
use App\Services\Agent\PayoutService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Agent commission withdrawals: an agent asks to move commission into its own Chips;
 * staff approve or reject (see PayoutService).
 */
class PayoutController extends Controller
{
    public function __construct(private readonly PayoutService $payouts) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = AgentPayoutRequest::query()->with('agent.user:id,name,username')->latest('id');

        if ($user->isAgent()) {
            $query->where('agent_id', $user->agent?->id);
        } else {
            abort_unless($user->can('manage_commissions'), 403);
        }

        return response()->json([
            'data' => $query->limit(100)->get()->map(fn (AgentPayoutRequest $r) => $this->present($r)),
            'meta' => ['enabled' => PayoutService::enabled()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'currency' => ['nullable', Rule::enum(Currency::class)->only(Currency::multiplayer())],
            'note' => ['nullable', 'string', 'max:255'],
            'amount' => ['required', 'regex:/^\d{1,13}(\.\d{1,2})?$/'],
        ]);

        abort_unless($request->user()->isAgent() && $request->user()->agent, 403);
        $payout = $this->payouts->request($request->user()->agent, Currency::from($data['currency'] ?? Currency::CH->value), Points::toMinor($data['amount']), $request->user(), $data['note'] ?? null);

        return response()->json(['message' => 'Withdrawal request sent for approval.', 'data' => $this->present($payout)], 201);
    }

    public function approve(Request $request, AgentPayoutRequest $payout): JsonResponse
    {
        return response()->json(['data' => $this->present($this->payouts->approve($request->user(), $payout))]);
    }

    public function reject(Request $request, AgentPayoutRequest $payout): JsonResponse
    {
        return response()->json(['data' => $this->present($this->payouts->reject($request->user(), $payout))]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(AgentPayoutRequest $r): array
    {
        return [
            'id' => $r->id,
            'agent' => $r->agent?->user?->only(['id', 'name', 'username']),
            'currency' => $r->currency->value,
            'amount' => Points::decimal($r->amount),
            'status' => $r->status === 'paid' ? 'approved' : $r->status,
            'created_at' => $r->created_at?->toIso8601String(),
        ];
    }
}
