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
 * The authenticated user's own wallets. CP and VC are always separate.
 */
class WalletController extends Controller
{
    public function balances(Request $request, WalletService $wallets): JsonResponse
    {
        $wallets->provision($request->user());

        return response()->json([
            'data' => WalletResource::collection($request->user()->wallets()->orderBy('type')->orderBy('currency')->get())->resolve($request),
            'meta' => [
                'cash_deposits_enabled' => (bool) config('pusoy.features.cash_deposits'),
                'cash_withdrawals_enabled' => (bool) config('pusoy.features.cash_withdrawals'),
                'daily_reward_enabled' => (bool) config('pusoy.features.daily_vc_reward'),
                'daily_reward_claimed' => $request->user()->profile?->last_daily_reward_on?->isToday() ?? false,
            ],
        ]);
    }

    public function transactions(Request $request): AnonymousResourceCollection
    {
        $request->validate([
            'currency' => ['nullable', 'in:CP,VC'],
            'type' => ['nullable', 'string', 'max:32'],
            'wallet_type' => ['nullable', 'in:player,allocation,commission'],
        ]);

        $walletIds = $request->user()->wallets()
            ->when($request->filled('currency'), fn ($q) => $q->where('currency', $request->input('currency')))
            ->when($request->filled('wallet_type'), fn ($q) => $q->where('type', $request->input('wallet_type')))
            ->pluck('id')->all();

        $transactions = WalletTransaction::query()
            ->forWallets($walletIds)
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->latest('id')
            ->paginate(min((int) $request->integer('per_page', 20), 100));

        TransactionResource::$viewerWalletIds = $walletIds;

        return TransactionResource::collection($transactions);
    }

    public function claimDailyReward(Request $request, WalletService $wallets): JsonResponse
    {
        if (! config('pusoy.features.daily_vc_reward') || ! $request->user()->isPlayer()) {
            throw new BusinessRuleException('Daily rewards are not available.', 403, 'feature_disabled');
        }

        $transaction = $wallets->claimDailyReward($request->user());

        return response()->json([
            'message' => $transaction->wasRecentlyCreated ? 'Daily VC reward claimed.' : 'You already claimed today\'s reward.',
            'data' => ['reference' => $transaction->reference, 'amount' => (new TransactionResource($transaction))->resolve($request)['amount']],
        ], $transaction->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Real-money deposits/withdrawals stay disabled until legal approval.
     */
    public function cashDisabled(): JsonResponse
    {
        return response()->json([
            'message' => 'Cash deposits, withdrawals and redemption are disabled pending regulatory approval.',
            'error' => 'feature_disabled',
        ], 403);
    }
}
