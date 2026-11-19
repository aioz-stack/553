<?php

use App\Enums\Currency;
use App\Enums\WalletType;
use App\Models\AuditLog;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

test('super admin credits and debits Gold or Chips by user, ledgered and audited', function () {
    $super = User::factory()->superAdmin()->create();
    $player = User::factory()->player()->create();
    $agent = User::factory()->agent()->create();

    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', [
        'user_id' => $player->id, 'currency' => 'GD', 'direction' => 'credit', 'amount' => '1000000', 'reason' => 'Test deposit', 'idempotency_key' => 'dep-1',
    ])->assertCreated()->assertJsonPath('data.balance', '1000000.00');

    // Same idempotency key: no second deposit.
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', [
        'user_id' => $player->id, 'currency' => 'GD', 'direction' => 'credit', 'amount' => '1000000', 'reason' => 'Test deposit', 'idempotency_key' => 'dep-1',
    ])->assertOk();
    expect(balance($player, Currency::GD))->toBe(1_000_000_00)->and(balance($player, Currency::CH))->toBe(0);

    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', [
        'user_id' => $player->id, 'currency' => 'GD', 'direction' => 'debit', 'amount' => '250000', 'reason' => 'Test withdrawal',
    ])->assertCreated()->assertJsonPath('data.balance', '750000.00');

    // Cannot withdraw more than the balance.
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', [
        'user_id' => $player->id, 'currency' => 'GD', 'direction' => 'debit', 'amount' => '750000.01', 'reason' => 'Too much',
    ])->assertStatus(422);
    expect(balance($player, Currency::GD))->toBe(750_000_00);

    // Staff receive into their allocation wallet.
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', [
        'user_id' => $agent->id, 'currency' => 'CH', 'direction' => 'credit', 'amount' => '500', 'reason' => 'Agent top-up',
    ])->assertCreated();
    expect(balance($agent, Currency::CH, WalletType::Allocation))->toBe(500_00);

    // By wallet id still works.
    $wallet = app(WalletService::class)->for($player, Currency::GD);
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', [
        'wallet_id' => $wallet->id, 'direction' => 'debit', 'amount' => '50000', 'reason' => 'Row withdraw',
    ])->assertCreated();
    expect(balance($player, Currency::GD))->toBe(700_000_00);

    expect(WalletTransaction::query()->whereIn('type', ['MANUAL_ADJUSTMENT', 'PLAYER_DEBIT'])->count())->toBe(4);
    expect(AuditLog::query()->where('action', 'wallet.adjust')->count())->toBe(4);
});

test('only super admin can deposit or withdraw, and never into a super admin', function () {
    $super = User::factory()->superAdmin()->create();
    $other = User::factory()->superAdmin()->create();
    $admin = User::factory()->administrator()->create();
    $player = User::factory()->player()->create();
    $body = ['user_id' => $player->id, 'currency' => 'CH', 'direction' => 'credit', 'amount' => '10', 'reason' => 'Not allowed'];

    $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/adjustments', $body)->assertForbidden();
    $this->actingAs($player, 'sanctum')->postJson('/api/v1/admin/adjustments', $body)->assertForbidden();
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', ['user_id' => $other->id] + $body)->assertStatus(422);
    $superWallet = app(WalletService::class)->for($other, Currency::CH);
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', ['wallet_id' => $superWallet->id, 'direction' => 'credit', 'amount' => '10', 'reason' => 'Not allowed'])->assertStatus(422);
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', ['user_id' => $player->id, 'direction' => 'credit', 'amount' => '10', 'reason' => 'No currency'])
        ->assertStatus(422)->assertJsonValidationErrors('currency');

    expect(balance($player))->toBe(0);
});

test('wallet summary totals points per currency and wallet type, never mixing Gold and Chips', function () {
    $super = User::factory()->superAdmin()->create();
    $player = User::factory()->player()->create();
    $agent = User::factory()->agent()->create();
    fund($player, 1_500_00, Currency::CH);
    fund($agent, 10_000_00, Currency::CH);
    fund($player, 2_000_00, Currency::GD);

    $res = $this->actingAs($super, 'sanctum')->getJson('/api/v1/admin/wallets/summary')->assertOk();

    expect($res->json('data.CH.total'))->toBe('11500.00')
        ->and($res->json('data.CH.by_type.player.total'))->toBe('1500.00')
        ->and($res->json('data.CH.by_type.allocation.total'))->toBe('10000.00')
        ->and($res->json('data.GD.total'))->toBe('2000.00')
        ->and($res->json('data.GD.by_type.allocation.total_minor'))->toBe(0)
        ->and($res->json('data'))->toHaveKeys(['GD', 'CH'])->not->toHaveKeys(['CP', 'VC', 'GP']);

    $this->actingAs($player, 'sanctum')->getJson('/api/v1/admin/wallets/summary')->assertForbidden();
});
