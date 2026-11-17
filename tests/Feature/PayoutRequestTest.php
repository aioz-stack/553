<?php

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Models\AgentPayoutRequest;
use App\Models\User;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->agent = User::factory()->agent()->create();

    // Give the agent 50.00 CP of commission (as if commissions had been paid).
    app(LedgerService::class)->transfer(new TransferRequest(
        TransactionType::CommissionPayment, Currency::CP, null,
        app(WalletService::class)->for($this->agent, Currency::CP, WalletType::Commission), 5000,
    ));
});

test('payout requests are refused while cash features are disabled', function () {
    $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['currency' => 'CP', 'amount' => '10'])
        ->assertForbidden()->assertJsonPath('error', 'feature_disabled');

    $this->actingAs($this->agent)->getJson('/api/v1/agent/payout-requests')->assertOk()->assertJsonPath('meta.enabled', false);
});

test('with approval flags on, agents request and staff approve CP payouts', function () {
    config(['pusoy.features.cp_commission_payouts' => true, 'pusoy.features.cash_withdrawals' => true]);

    $id = $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['currency' => 'CP', 'amount' => '30'])->assertCreated()->json('data.id');

    // Pending requests reserve the balance.
    $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['currency' => 'CP', 'amount' => '30'])->assertUnprocessable();

    // VC is never paid out.
    $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['currency' => 'VC', 'amount' => '1'])->assertForbidden();

    // Agents cannot approve (not staff).
    $this->actingAs($this->agent)->postJson("/api/v1/admin/payout-requests/{$id}/approve")->assertForbidden();

    $this->actingAs(superAdmin())->postJson("/api/v1/admin/payout-requests/{$id}/approve")->assertOk()->assertJsonPath('data.status', 'paid');

    expect(balance($this->agent, Currency::CP, WalletType::Commission))->toBe(2000)
        ->and(AgentPayoutRequest::query()->find($id)->wallet_transaction_id)->not->toBeNull()
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('staff can reject a payout request', function () {
    config(['pusoy.features.cp_commission_payouts' => true, 'pusoy.features.cash_withdrawals' => true]);
    $id = $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['currency' => 'CP', 'amount' => '10'])->json('data.id');

    $this->actingAs(superAdmin())->postJson("/api/v1/admin/payout-requests/{$id}/reject")->assertJsonPath('data.status', 'rejected');
    expect(balance($this->agent, Currency::CP, WalletType::Commission))->toBe(5000);
});
