<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Wallet\ShopRevenueShares;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin Panel → Revenue Sharing Rates → Shop revenue-sharing rates (key purchases). Staff routes only;
 * saving is limited to the Administrator (Super Admin, or an Administrator with
 * manage_commissions) and checked again in ShopRevenueShares.
 */
class ShopSharesController extends Controller
{
    public function __construct(private readonly ShopRevenueShares $shares) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->shares->present($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        abort_unless(ShopRevenueShares::canEdit($request->user()), 403, 'Only the Administrator can change revenue-sharing rates.');

        $data = $request->validate([
            'rates' => ['required', 'array'],
            'rates.*' => ['required', 'array'],
            'rates.*.*' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);
        $this->shares->set($request->user(), $data['rates']);

        return response()->json(['message' => 'Revenue-sharing rates saved. They apply to new key purchases.', 'data' => $this->shares->present($request->user())]);
    }
}
