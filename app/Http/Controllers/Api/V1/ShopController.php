<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Currency;
use App\Http\Controllers\Controller;
use App\Models\KeyExchange;
use App\Services\Wallet\KeyExchangeService;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Shop (Main Lobby pop-up): Keys → Chips exchange packages. Everything is decided on the server
 * (KeyExchangeService); the app only shows the packages, balances and history from here.
 */
class ShopController extends Controller
{
    /** GET /shop — packages, your Keys and Chips, and your latest exchanges. */
    public function index(Request $request, WalletService $wallets): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => [
                'packages' => collect(KeyExchangeService::packages())->map(fn (array $p, string $id) => ['id' => $id, 'keys' => $p['keys'], 'chips' => $p['chips']])->values(),
                'balances' => [
                    'keys' => Points::decimal($wallets->for($user, Currency::KY)->balance),
                    'chips' => Points::decimal($wallets->for($user, Currency::CH)->balance),
                ],
                'history' => $this->history($request),
            ],
        ]);
    }

    /** POST /shop/key-exchanges — exchange Keys for Chips (confirmed, idempotent, final). */
    public function exchange(Request $request, KeyExchangeService $shop, WalletService $wallets): JsonResponse
    {
        $data = $request->validate([
            'package' => ['required', 'string', Rule::in(array_keys(KeyExchangeService::packages()))],
            'idempotency_key' => ['required', 'string', 'min:8', 'max:64'],
            'confirmed' => ['accepted'],
        ], [
            'package.in' => 'Choose one of the Shop packages.',
            'confirmed.accepted' => 'Please confirm that you understand exchanges are final and non-refundable.',
        ]);

        $exchange = $shop->exchange($request->user(), $data['package'], $data['idempotency_key']);
        $user = $request->user();

        return response()->json([
            'message' => 'Exchanged '.Points::decimal($exchange->keys_amount).' Keys for '.Points::decimal($exchange->reward_amount).' '.Currency::from($exchange->reward_currency)->label().'.',
            'data' => [
                'exchange' => $this->present($exchange),
                'balances' => [
                    'keys' => Points::decimal($wallets->for($user, Currency::KY)->fresh()->balance),
                    'chips' => Points::decimal($wallets->for($user, Currency::CH)->fresh()->balance),
                ],
            ],
        ], $exchange->wasRecentlyCreated || $exchange->wasChanged('status') ? 201 : 200); // 200 = an earlier identical request
    }

    /** @return list<array<string, mixed>> */
    private function history(Request $request): array
    {
        return KeyExchange::query()->where('user_id', $request->user()->id)->where('status', KeyExchange::COMPLETED)
            ->latest('id')->limit(10)->get()->map(fn (KeyExchange $e) => $this->present($e))->all();
    }

    /** @return array<string, mixed> */
    private function present(KeyExchange $e): array
    {
        return [
            'id' => $e->id,
            'package' => $e->package,
            'keys' => Points::decimal($e->keys_amount),
            'amount' => Points::decimal($e->reward_amount),
            'currency' => $e->reward_currency,
            'status' => $e->status,
            'created_at' => $e->created_at?->toIso8601String(),
        ];
    }
}
