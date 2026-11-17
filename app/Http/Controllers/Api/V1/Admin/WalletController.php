<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Currency;
use App\Http\Controllers\Controller;
use App\Http\Requests\AdjustWalletRequest;
use App\Http\Requests\AllocatePointsRequest;
use App\Http\Resources\TransactionResource;
use App\Http\Resources\WalletResource;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\AllocationService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class WalletController extends Controller
{
    public function wallets(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('review_transactions'), 403);

        return WalletResource::collection(Wallet::query()->with('user')
            ->when($request->filled('currency'), fn ($q) => $q->where('currency', $request->input('currency')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->when($request->filled('user_id'), fn ($q) => $q->where('user_id', $request->integer('user_id')))
            ->when($request->filled('search'), fn ($q) => $q->whereHas('user', fn ($u) => $u->where('username', 'like', '%'.$request->input('search').'%')))
            ->orderByDesc('balance')
            ->paginate(min((int) $request->integer('per_page', 25), 100))->withQueryString());
    }

    public function transactions(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('review_transactions'), 403);
        TransactionResource::$viewerWalletIds = null;

        return TransactionResource::collection(WalletTransaction::query()->with(['source.user', 'destination.user', 'creator'])
            ->when($request->filled('currency'), fn ($q) => $q->where('currency', $request->input('currency')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->when($request->filled('user_id'), fn ($q) => $q->forWallets(Wallet::query()->where('user_id', $request->integer('user_id'))->pluck('id')->all()))
            ->when($request->filled('reference'), fn ($q) => $q->where('reference', $request->input('reference')))
            ->when($request->filled('game_session_id'), fn ($q) => $q->where('game_session_id', $request->integer('game_session_id')))
            ->latest('id')
            ->paginate(min((int) $request->integer('per_page', 25), 100))->withQueryString());
    }

    /**
     * Shared by Super Admin, Administrators and Agents (see AllocationService rules).
     */
    public function allocate(AllocatePointsRequest $request, AllocationService $allocations): JsonResponse
    {
        $data = $request->validated();

        $transaction = $allocations->allocate(
            $request->user(),
            User::query()->findOrFail($data['recipient_id']),
            Currency::from($data['currency']),
            Points::toMinor($data['amount']),
            $data['reason'] ?? null,
            $data['idempotency_key'] ?? $request->header('Idempotency-Key'),
        );

        return response()->json([
            'message' => $transaction->wasRecentlyCreated ? 'Points allocated.' : 'Duplicate request: original allocation returned.',
            'data' => ['reference' => $transaction->reference, 'amount' => Points::decimal($transaction->amount), 'currency' => $transaction->currency->value],
        ], $transaction->wasRecentlyCreated ? 201 : 200);
    }

    public function adjust(AdjustWalletRequest $request, AllocationService $allocations): JsonResponse
    {
        $data = $request->validated();
        $amount = Points::toMinor($data['amount']);

        $transaction = $allocations->adjust(
            $request->user(),
            Wallet::query()->findOrFail($data['wallet_id']),
            $data['direction'] === 'credit' ? $amount : -$amount,
            $data['reason'],
            $data['idempotency_key'] ?? $request->header('Idempotency-Key'),
        );

        return response()->json(['data' => ['reference' => $transaction->reference]], 201);
    }

    public function freeze(Request $request, Wallet $wallet, AllocationService $allocations): WalletResource
    {
        $data = $request->validate(['frozen' => ['required', 'boolean']]);

        return new WalletResource($allocations->setFrozen($request->user(), $wallet, $data['frozen']));
    }

    public function reverse(Request $request, WalletTransaction $transaction, LedgerService $ledger): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:255']]);

        $reversal = $ledger->reverse($transaction, $request->user(), $data['reason']);
        AuditLogger::log($request->user(), 'wallet.reverse', $transaction, null, ['reversal' => $reversal->reference, 'reason' => $data['reason']]);

        return response()->json(['data' => ['reference' => $reversal->reference]], 201);
    }

    public function reconcile(Request $request, WalletService $wallets): JsonResponse
    {
        abort_unless($request->user()->can('review_transactions'), 403);

        return response()->json(['data' => $wallets->reconcile()]);
    }
}
