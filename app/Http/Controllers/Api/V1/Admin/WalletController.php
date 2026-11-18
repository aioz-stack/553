<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Currency;
use App\Enums\WalletType;
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

    /**
     * Super Admin point deposit (credit) / withdrawal (debit). Ledgered as
     * MANUAL_ADJUSTMENT / PLAYER_DEBIT with a wallet_adjustments row and an
     * audit entry. Points only — real-money deposits/withdrawals stay behind
     * the cash feature flags (see wallet/deposit|withdraw).
     */
    public function adjust(AdjustWalletRequest $request, AllocationService $allocations, WalletService $wallets): JsonResponse
    {
        $data = $request->validated();
        $amount = Points::toMinor($data['amount']);

        if (! empty($data['wallet_id'])) {
            $wallet = Wallet::query()->with('user')->findOrFail($data['wallet_id']);
            abort_if((bool) $wallet->user?->isSuperAdmin(), 422, 'Super Admin accounts have no wallet to deposit into.');
        } else {
            $user = User::query()->findOrFail($data['user_id']);
            abort_if($user->isSuperAdmin(), 422, 'Super Admin accounts have no wallet to deposit into.');
            $wallet = $wallets->for($user, Currency::from($data['currency']), $user->isPlayer() ? WalletType::Player : WalletType::Allocation);
        }

        $transaction = $allocations->adjust(
            $request->user(),
            $wallet,
            $data['direction'] === 'credit' ? $amount : -$amount,
            $data['reason'],
            $data['idempotency_key'] ?? $request->header('Idempotency-Key'),
        );

        return response()->json([
            'message' => $data['direction'] === 'credit' ? 'Points deposited.' : 'Points withdrawn.',
            'data' => [
                'reference' => $transaction->reference,
                'wallet_id' => $wallet->id,
                'balance' => Points::decimal($wallet->fresh()->balance),
            ],
        ], $transaction->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Total points held per currency, broken down by wallet type. CP and VC
     * are never added together.
     */
    public function summary(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('review_transactions'), 403);

        $rows = Wallet::query()
            ->selectRaw('currency, type, SUM(balance) as total, COUNT(*) as wallets')
            ->groupBy('currency', 'type')
            ->get();

        $out = [];
        foreach (Currency::cases() as $currency) {
            $byType = [];
            $sum = 0;
            foreach (WalletType::cases() as $type) {
                $row = $rows->first(fn ($r) => $r->currency === $currency && $r->type === $type);
                $minor = (int) ($row->total ?? 0);
                $sum += $minor;
                $byType[$type->value] = ['total' => Points::decimal($minor), 'total_minor' => $minor, 'wallets' => (int) ($row->wallets ?? 0)];
            }
            $out[$currency->value] = ['total' => Points::decimal($sum), 'total_minor' => $sum, 'by_type' => $byType];
        }

        return response()->json(['data' => $out]);
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
