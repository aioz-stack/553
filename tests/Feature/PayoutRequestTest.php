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

    // Give the agent 50.00 Chips of commission (as if commissions had been paid).
    app(LedgerService::class)->transfer(new TransferRequest(
        TransactionType::CommissionPayment, Currency::CH, null,
        app(WalletService::class)->for($this->agent, Currency::CH, WalletType::Commission), 5000,
    ));
});

test('an agent requests a commission withdrawal; approval moves it into the agent\'s own Chips, exactly once', function () {
    $id = $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['amount' => '30'])->assertCreated()
        ->assertJsonPath('data.status', 'pending')->json('data.id');

    // Pending requests reserve the balance: only 20.00 is left to request.
    $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['amount' => '30'])->assertUnprocessable();
    // Commissions are withdrawn in Chips only.
    $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['currency' => 'GD', 'amount' => '1'])->assertUnprocessable()->assertJsonValidationErrors('currency');

    // Agents cannot approve (not staff).
    $this->actingAs($this->agent)->postJson("/api/v1/admin/payout-requests/{$id}/approve")->assertForbidden();

    $super = superAdmin();
    $this->actingAs($super)->postJson("/api/v1/admin/panel/withdrawals/{$id}/approve")->assertOk()->assertJsonPath('data.status', 'approved');
    $this->actingAs($super)->postJson("/api/v1/admin/panel/withdrawals/{$id}/approve")->assertStatus(409);

    expect(balance($this->agent, Currency::CH, WalletType::Commission))->toBe(2000)
        ->and(balance($this->agent, Currency::CH, WalletType::Allocation))->toBe(3000)
        ->and(AgentPayoutRequest::query()->find($id)->wallet_transaction_id)->not->toBeNull()
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('staff can reject a withdrawal request (nothing moves) or withdraw directly from an agent row', function () {
    $id = $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['amount' => '10'])->json('data.id');
    $super = superAdmin();

    $this->actingAs($super)->postJson("/api/v1/admin/panel/withdrawals/{$id}/reject", ['note' => 'Not this week'])->assertJsonPath('data.status', 'rejected');
    expect(balance($this->agent, Currency::CH, WalletType::Commission))->toBe(5000);

    $this->actingAs($super)->postJson("/api/v1/admin/panel/accounts/{$this->agent->id}/withdraw-commission", ['amount' => '50'])->assertCreated()->assertJsonPath('data.status', 'approved');
    $this->actingAs($super)->postJson("/api/v1/admin/panel/accounts/{$this->agent->id}/withdraw-commission", ['amount' => '0.01'])->assertUnprocessable();
    expect(balance($this->agent, Currency::CH, WalletType::Commission))->toBe(0)
        ->and(balance($this->agent, Currency::CH, WalletType::Allocation))->toBe(5000);

    $this->actingAs($super)->getJson('/api/v1/admin/panel/withdrawals')->assertOk()
        ->assertJsonPath('meta.summary.withdrawn', '50.00')->assertJsonPath('meta.summary.available', '0.00');
});
