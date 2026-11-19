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

test('commission payouts are never available: Chips are never paid out and Gold or retired currencies are rejected', function () {
    $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['currency' => 'CH', 'amount' => '10'])
        ->assertForbidden()->assertJsonPath('error', 'feature_disabled');
    $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['currency' => 'GD', 'amount' => '10'])
        ->assertUnprocessable()->assertJsonValidationErrors('currency');
    $this->actingAs($this->agent)->postJson('/api/v1/agent/payout-requests', ['currency' => 'CP', 'amount' => '10'])
        ->assertUnprocessable()->assertJsonValidationErrors('currency');

    $this->actingAs($this->agent)->getJson('/api/v1/agent/payout-requests')->assertOk()->assertJsonPath('meta.enabled', false);
    expect(AgentPayoutRequest::query()->count())->toBe(0)
        ->and(balance($this->agent, Currency::CH, WalletType::Commission))->toBe(5000);
});
