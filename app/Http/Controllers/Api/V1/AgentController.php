<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Resources\CommissionResource;
use App\Http\Resources\TransactionResource;
use App\Http\Resources\UserResource;
use App\Http\Resources\WalletResource;
use App\Models\Agent;
use App\Models\GameResult;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Reports\ReportService;
use App\Services\Users\UserManagementService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Agent self-service. Every query is scoped to the authenticated agent;
 * agents can never see or touch another agent's players. Allocation uses
 * the shared /wallet/allocate endpoint (AllocationService enforces ownership).
 */
class AgentController extends Controller
{
    public function dashboard(Request $request, ReportService $reports): JsonResponse
    {
        return response()->json(['data' => $reports->agentOverview($this->agent($request))]);
    }

    public function players(Request $request): AnonymousResourceCollection
    {
        $agent = $this->agent($request);

        return UserResource::collection($agent->players()->with('profile')
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($w) => $w->where('users.name', 'like', '%'.$request->input('search').'%')->orWhere('users.username', 'like', '%'.$request->input('search').'%')))
            ->orderByDesc('agent_players.assigned_at')
            ->paginate(min((int) $request->integer('per_page', 20), 100))->withQueryString());
    }

    public function player(Request $request, User $player): JsonResponse
    {
        $this->authorize('manage', $player);

        return response()->json(['data' => [
            'player' => (new UserResource($player->load('profile')))->resolve($request),
            'wallets' => WalletResource::collection($player->wallets()->where('type', 'player')->get())->resolve($request),
            'recent_games' => GameResult::query()->where('user_id', $player->id)->latest('id')->limit(10)->get(['game_session_id', 'score', 'placement', 'net_amount', 'created_at'])
                ->map(fn ($r) => ['game_session_id' => $r->game_session_id, 'score' => $r->score, 'placement' => $r->placement, 'net' => Points::decimal($r->net_amount), 'played_at' => $r->created_at->toIso8601String()]),
        ]]);
    }

    public function registerPlayer(StoreUserRequest $request, UserManagementService $users): JsonResponse
    {
        $player = $users->create($request->user(), Role::Player, collect($request->validated())->only(['name', 'username', 'email', 'phone', 'password'])->all());

        return response()->json(['data' => (new UserResource($player->load('profile')))->resolve($request)], 201);
    }

    public function wallets(Request $request): AnonymousResourceCollection
    {
        return WalletResource::collection($request->user()->wallets()->orderBy('type')->orderBy('currency')->get());
    }

    public function transactions(Request $request): AnonymousResourceCollection
    {
        $walletIds = $request->user()->wallets()->pluck('id')->all();
        TransactionResource::$viewerWalletIds = $walletIds;

        return TransactionResource::collection(WalletTransaction::query()->forWallets($walletIds)
            ->when($request->filled('currency'), fn ($q) => $q->where('currency', $request->input('currency')))
            ->latest('id')->paginate(min((int) $request->integer('per_page', 25), 100))->withQueryString());
    }

    public function commissions(Request $request): AnonymousResourceCollection
    {
        return CommissionResource::collection($this->agent($request)->commissions()->with('player')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->latest('id')->paginate(25)->withQueryString());
    }

    public function referralCodes(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->agent($request)->referralCodes()->latest('id')->get()]);
    }

    public function createReferralCode(Request $request, UserManagementService $users): JsonResponse
    {
        $data = $request->validate([
            'max_uses' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'expires_in_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $code = $users->createReferralCode(
            $this->agent($request),
            $data['max_uses'] ?? null,
            isset($data['expires_in_days']) ? now()->addDays($data['expires_in_days']) : null,
        );

        return response()->json(['data' => $code], 201);
    }

    public function activity(Request $request): JsonResponse
    {
        $playerIds = $this->agent($request)->players()->pluck('users.id');

        return response()->json(['data' => GameResult::query()->with('user:id,name,username')->whereIn('user_id', $playerIds)
            ->latest('id')->limit(100)->get()
            ->map(fn ($r) => ['player' => $r->user?->only(['id', 'name', 'username']), 'game_session_id' => $r->game_session_id, 'score' => $r->score, 'placement' => $r->placement, 'net' => Points::decimal($r->net_amount), 'at' => $r->created_at->toIso8601String()])]);
    }

    private function agent(Request $request): Agent
    {
        return $request->user()->agent ?? abort(403, 'Agent profile missing.');
    }
}
