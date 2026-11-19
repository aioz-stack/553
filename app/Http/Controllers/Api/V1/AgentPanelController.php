<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Currency;
use App\Enums\UserStatus;
use App\Enums\WalletType;
use App\Http\Controllers\Controller;
use App\Models\Agent;
use App\Models\AgentPayoutRequest;
use App\Models\ChipLoad;
use App\Models\User;
use App\Services\Agent\PayoutService;
use App\Services\Users\ReferralService;
use App\Services\Wallet\ChipLoadService;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The agent side of the Admin Panel features (Agents, Master Agents, Silver Agents):
 * the account's permanent referral links, Chips and commission balances, its downline,
 * Chips requests to the Administrator and its commission withdrawals.
 */
class AgentPanelController extends Controller
{
    public function panel(Request $request, ReferralService $referrals, ChipLoadService $chips, PayoutService $payouts, WalletService $wallets): JsonResponse
    {
        $user = $request->user();
        $agent = $user->agent;
        abort_unless($agent instanceof Agent, 403);

        return response()->json(['data' => [
            'level' => $agent->level->value,
            'level_label' => $agent->level->label(),
            'upline' => $agent->parent?->user?->only(['id', 'username', 'name']),
            'sponsor' => $user->sponsor?->only(['id', 'username', 'name']),
            'links' => $referrals->links($user),
            'chips' => Points::decimal($chips->chipsBalance($user)),
            'commission' => [
                'balance' => Points::decimal((int) $wallets->for($user, Currency::CH, WalletType::Commission)->balance),
                'available' => Points::decimal($payouts->available($agent)),
                'withdrawn' => Points::decimal((int) AgentPayoutRequest::query()->where('agent_id', $agent->id)->where('status', 'approved')->sum('amount')),
            ],
            'downline' => [
                'agents' => Agent::query()->where('parent_agent_id', $agent->id)->count(),
                'players' => $agent->players()->where('users.status', UserStatus::Active->value)->count(),
                'pending' => User::query()->where('sponsor_id', $user->id)->where('status', UserStatus::Pending->value)->count(),
            ],
            'chip_requests' => ChipLoad::query()->where('account_id', $user->id)->where('direction', ChipLoad::REQUEST)->latest('id')->limit(10)->get()->map(fn (ChipLoad $l) => [
                'reference' => $l->reference,
                'amount' => Points::decimal($l->amount),
                'status' => $l->status,
                'note' => $l->note,
                'created_at' => $l->created_at?->toIso8601String(),
            ]),
        ]]);
    }

    public function requestChips(Request $request, ChipLoadService $chips): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'regex:/^\d{1,13}(\.\d{1,2})?$/'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $load = $chips->request($request->user(), Points::toMinor($data['amount']), $data['note'] ?? null);

        return response()->json(['message' => 'Chips request sent for approval.', 'data' => ['reference' => $load->reference, 'status' => $load->status, 'amount' => Points::decimal($load->amount)]], 201);
    }
}
