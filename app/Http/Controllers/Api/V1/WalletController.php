<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Http\Resources\TransactionResource;
use App\Http\Resources\WalletResource;
use App\Models\WalletTransaction;
use App\Services\Wallet\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The authenticated user's own wallets: Gold (Single Player) and Chips (Multiplayer), never combined.
 */
class WalletController extends Controller
{
    public function balances(Request $request, WalletService $wallets): JsonResponse
    {
        $wallets->provision($request->user());

        return response()->json([
            'data' => WalletResource::collection($request->user()->wallets()->orderBy('type')->orderBy('currency')->get())->resolve($request),
            'meta' => [
                'daily_reward_enabled' => (bool) config('pusoy.features.daily_chips_reward'),
                'daily_reward_claimed' => $request->user()->profile?->last_daily_reward_on?->isToday() ?? false,
            ],
        ]);
    }

    public function transactions(Request $request): AnonymousResourceCollection
    {
        $request->validate([
            'currency' => ['nullable', 'in:GD,CH'],
            'type' => ['nullable', 'string', 'max:32'],
            'wallet_type' => ['nullable', 'in:player,allocation,commission'],
            'role' => ['nullable', 'in:banker,player'],
        ]);

        $walletIds = $request->user()->wallets()
            ->when($request->filled('currency'), fn ($q) => $q->where('currency', $request->input('currency')))
            ->when($request->filled('wallet_type'), fn ($q) => $q->where('type', $request->input('wallet_type')))
            ->pluck('id')->all();

        $transactions = WalletTransaction::query()
            ->forWallets($walletIds)
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            // Banker transaction history: covers and settlements made as banker.
            ->when($request->filled('role'), fn ($q) => $q->where('metadata->role', $request->input('role')))
            ->latest('id')
            ->paginate(min((int) $request->integer('per_page', 20), 100));

        TransactionResource::$viewerWalletIds = $walletIds;

        return TransactionResource::collection($transactions);
    }

    public function claimDailyReward(Request $request, WalletService $wallets): JsonResponse
    {
        if (! config('pusoy.features.daily_chips_reward') || ! $request->user()->isPlayer()) {
            throw new BusinessRuleException('Daily rewards are not available.', 403, 'feature_disabled');
        }

        $transaction = $wallets->claimDailyReward($request->user());

        return response()->json([
            'message' => $transaction->wasRecentlyCreated ? 'Daily Chips reward claimed.' : 'You already claimed today\'s reward.',
            'data' => ['reference' => $transaction->reference, 'amount' => (new TransactionResource($transaction))->resolve($request)['amount']],
        ], $transaction->wasRecentlyCreated ? 201 : 200);
    }

}
