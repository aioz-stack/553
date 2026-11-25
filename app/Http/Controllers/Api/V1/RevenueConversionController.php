<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Wallet\RevenueConversionService;
use App\Support\Points;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Self Convert Revenue to Chips (Admin, Incorporator and Master Agent Overview). The route is
 * limited to those roles and the service checks again. The client sends the amount and a request
 * id; the minimum, the balance, the rate and the Chips are checked / decided on the server.
 */
class RevenueConversionController extends Controller
{
    public function __construct(private readonly RevenueConversionService $conversions) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->conversions->summary($request->user())]);
    }

    public function convert(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'regex:/^\d{1,13}(\.\d{1,2})?$/'],
            'request_id' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9-]+$/'],
        ], ['amount.regex' => 'Enter a valid amount (up to 2 decimals).']);

        $conversion = $this->conversions->convert($request->user(), Points::toMinor($data['amount']), $data['request_id']);

        return response()->json([
            'message' => Points::format($conversion->revenue_amount).' Revenue converted: '.Points::format($conversion->chips_amount).' Chips credited to your wallet.',
            'data' => [
                'conversion' => $this->conversions->present($conversion),
                'summary' => $this->conversions->summary($request->user()),
            ],
        ]);
    }
}
