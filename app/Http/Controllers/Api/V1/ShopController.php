<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Currency;
use App\Http\Controllers\Controller;
use App\Models\KeyExchange;
use App\Models\KeyExchangeShare;
use App\Services\Wallet\KeyExchangeService;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Shop (Main Lobby pop-up): buy Keys with Chips (5 Chips = 1 Key). Everything is decided on the
 * server (KeyExchangeService); the app only shows the packages, balances and history from here.
 */
class ShopController extends Controller
{
    /** GET /shop — packages (Chips → Keys), your Chips and Keys, and your latest exchanges. */
    public function index(Request $request, WalletService $wallets): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => [
                'chips_per_key' => KeyExchangeService::chipsPerKey(),
                'packages' => collect(KeyExchangeService::packages())->map(fn (array $p, string $id) => ['id' => $id, 'chips' => $p['chips'], 'keys' => $p['keys']])->values(),
                'balances' => $this->balances($user, $wallets),
                'history' => KeyExchange::query()->where('user_id', $user->id)->where('status', KeyExchange::COMPLETED)
                    ->latest('id')->limit(10)->get()->map(fn (KeyExchange $e) => $this->present($e, false))->all(),
            ],
        ]);
    }

    /** POST /shop/key-exchanges — pay Chips, receive Keys (confirmed, idempotent, final). */
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

        return response()->json([
            'message' => 'Exchanged '.Points::decimal($exchange->chips_amount).' Chips for '.Points::decimal($exchange->keys_amount).' Keys.',
            'data' => [
                'exchange' => $this->present($exchange, true),
                'balances' => $this->balances($request->user(), $wallets),
            ],
        ], $exchange->wasRecentlyCreated || $exchange->wasChanged('status') ? 201 : 200); // 200 = an earlier identical request
    }

    /** @return array{chips: string, keys: string} */
    private function balances($user, WalletService $wallets): array
    {
        return [
            'chips' => Points::decimal($wallets->for($user, Currency::CH)->fresh()->balance),
            'keys' => Points::decimal($wallets->for($user, Currency::KY)->fresh()->balance),
        ];
    }

    /**
     * The player's view of an exchange. Earlier 'keys_out' exchanges (Keys given for Gold / Chips)
     * keep their own direction. Shares are only shown right after the player's own exchange.
     *
     * @return array<string, mixed>
     */
    private function present(KeyExchange $e, bool $withShares): array
    {
        $chipsToKeys = $e->direction === KeyExchange::CHIPS_TO_KEYS;

        return [
            'id' => $e->id,
            'package' => $e->package,
            'direction' => $e->direction,
            'chips' => Points::decimal($chipsToKeys ? $e->chips_amount : 0),
            'keys' => Points::decimal($e->keys_amount),
            // Earlier exchanges: what the Keys were given for.
            'paid_out' => $chipsToKeys ? null : ['amount' => Points::decimal((int) $e->reward_amount), 'currency' => $e->reward_currency],
            'status' => $e->status,
            'created_at' => $e->created_at?->toIso8601String(),
        ] + ($withShares ? ['shares' => $e->shares->map(fn (KeyExchangeShare $s) => ['role' => $s->role, 'percent' => $s->percent_bps / 100])->values()->all()] : []);
    }
}
