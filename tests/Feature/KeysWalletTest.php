<?php

use App\Enums\Currency;
use App\Enums\WalletType;
use App\Models\AuditLog;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

test('every player has a separate Keys wallet next to Gold and Chips; Keys have no allocation or commission wallets', function () {
    $player = User::factory()->player()->create();
    $agent = User::factory()->agent()->create();

    $wallets = collect($this->actingAs($player, 'sanctum')->getJson('/api/v1/wallet')->assertOk()->json('data'));
    expect($wallets->where('type', 'player')->pluck('currency')->sort()->values()->all())->toBe(['CH', 'GD', 'KY'])
        ->and($wallets->firstWhere('currency', 'KY')['balance'])->toBe('0.00');

    $this->actingAs($agent, 'sanctum')->getJson('/api/v1/wallet')->assertOk();
    expect(Wallet::query()->where('user_id', $agent->id)->where('currency', 'KY')->pluck('type')->map(fn ($t) => $t instanceof WalletType ? $t->value : $t)->all())->toBe(['player']);
});

test('a Super Admin loads and withdraws Keys through the audited adjustment; the ledger, history and live balance follow', function () {
    $super = superAdmin();
    $player = User::factory()->player()->create();

    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', ['user_id' => $player->id, 'currency' => 'KY', 'direction' => 'credit', 'amount' => '25', 'reason' => 'Event reward', 'idempotency_key' => 'k-1'])->assertCreated();
    // Same request again: no second credit.
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', ['user_id' => $player->id, 'currency' => 'KY', 'direction' => 'credit', 'amount' => '25', 'reason' => 'Event reward', 'idempotency_key' => 'k-1'])->assertOk();
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', ['user_id' => $player->id, 'currency' => 'KY', 'direction' => 'debit', 'amount' => '5', 'reason' => 'Correction'])->assertCreated();

    expect(balance($player, Currency::KY))->toBe(2_000)
        ->and(balance($player, Currency::CH))->toBe(0)->and(balance($player, Currency::GD))->toBe(0)
        ->and(WalletTransaction::query()->where('currency', 'KY')->count())->toBe(2)
        ->and(AuditLog::query()->where('action', 'wallet.adjust')->count())->toBe(2);

    $this->actingAs($player, 'sanctum')->getJson('/api/v1/wallet/transactions?currency=KY')->assertOk()->assertJsonCount(2, 'data');
    $this->actingAs($player, 'sanctum')->getJson('/api/v1/wallet/transactions?currency=CH')->assertOk()->assertJsonCount(0, 'data');
});

test('players and agents cannot create Keys; Keys cannot be allocated, bet or overdrawn', function () {
    $super = superAdmin();
    $player = User::factory()->player()->create();
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($player, 'sanctum')->postJson('/api/v1/admin/adjustments', ['user_id' => $player->id, 'currency' => 'KY', 'direction' => 'credit', 'amount' => '100', 'reason' => 'me'])->assertForbidden();
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/wallet/allocate', ['recipient_id' => $player->id, 'currency' => 'KY', 'amount' => '10'])->assertStatus(422);
    $this->actingAs($super, 'sanctum')->postJson('/api/v1/admin/adjustments', ['user_id' => $player->id, 'currency' => 'KY', 'direction' => 'debit', 'amount' => '1', 'reason' => 'x'])->assertStatus(422);
    expect(balance($player, Currency::KY))->toBe(0);
});
