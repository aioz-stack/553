<?php

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientBalanceException;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->ledger = app(LedgerService::class);
    $this->wallets = app(WalletService::class);
});

test('Gold and Chips wallets are separate and cannot be mixed', function () {
    $player = User::factory()->create();
    fund($player, 5000, Currency::CH);

    expect(balance($player, Currency::CH))->toBe(5000)
        ->and(balance($player, Currency::GD))->toBe(0);

    expect(fn () => $this->ledger->transfer(new TransferRequest(
        TransactionType::PlayerCredit, Currency::GD, $this->wallets->for($player, Currency::CH), $this->wallets->for($player, Currency::GD), 100,
    )))->toThrow(BusinessRuleException::class, 'Currency mismatch');
});

test('debits are refused when the balance is insufficient and nothing changes', function () {
    $a = User::factory()->create();
    $b = User::factory()->create();
    fund($a, 1000);

    expect(fn () => $this->ledger->transfer(new TransferRequest(
        TransactionType::PlayerDebit, Currency::CH, $this->wallets->for($a, Currency::CH), $this->wallets->for($b, Currency::CH), 1001,
    )))->toThrow(InsufficientBalanceException::class);

    expect(balance($a))->toBe(1000)->and(balance($b))->toBe(0);
});

test('every movement records balance before and after on both sides', function () {
    $a = User::factory()->create();
    $b = User::factory()->create();
    fund($a, 1000);

    $tx = $this->ledger->transfer(new TransferRequest(
        TransactionType::PlayerDebit, Currency::CH, $this->wallets->for($a, Currency::CH), $this->wallets->for($b, Currency::CH), 400, 'test',
    ));

    expect($tx->source_balance_before)->toBe(1000)
        ->and($tx->source_balance_after)->toBe(600)
        ->and($tx->destination_balance_before)->toBe(0)
        ->and($tx->destination_balance_after)->toBe(400)
        ->and($tx->reference)->toStartWith('TX');
});

test('idempotency keys prevent double spending', function () {
    $a = User::factory()->create();
    $b = User::factory()->create();
    fund($a, 1000);

    $request = new TransferRequest(TransactionType::PlayerDebit, Currency::CH, $this->wallets->for($a, Currency::CH), $this->wallets->for($b, Currency::CH), 700, idempotencyKey: 'same-key');

    $first = $this->ledger->transfer($request);
    $second = $this->ledger->transfer($request);

    expect($second->id)->toBe($first->id)
        ->and(balance($a))->toBe(300)
        ->and(balance($b))->toBe(700);

    // Same key, different parameters → conflict.
    expect(fn () => $this->ledger->transfer(new TransferRequest(TransactionType::PlayerDebit, Currency::CH, $this->wallets->for($a, Currency::CH), $this->wallets->for($b, Currency::CH), 100, idempotencyKey: 'same-key')))
        ->toThrow(BusinessRuleException::class, 'Idempotency key');
});

test('repeated concurrent-style requests can never overdraw a wallet', function () {
    $a = User::factory()->create();
    $b = User::factory()->create();
    fund($a, 1000);
    $source = $this->wallets->for($a, Currency::CH);
    $failures = 0;

    // Ten requests of 300 against a 1000 balance: only three may succeed.
    foreach (range(1, 10) as $i) {
        try {
            $this->ledger->transfer(new TransferRequest(TransactionType::PlayerDebit, Currency::CH, $source, $this->wallets->for($b, Currency::CH), 300, idempotencyKey: "req-{$i}"));
        } catch (InsufficientBalanceException) {
            $failures++;
        }
    }

    expect($failures)->toBe(7)->and(balance($a))->toBe(100)->and(balance($b))->toBe(900);
});

test('ledger transactions are immutable and corrected by reversal', function () {
    $a = User::factory()->create();
    $b = User::factory()->create();
    fund($a, 1000);

    $tx = $this->ledger->transfer(new TransferRequest(TransactionType::PlayerDebit, Currency::CH, $this->wallets->for($a, Currency::CH), $this->wallets->for($b, Currency::CH), 250));

    expect(fn () => $tx->update(['amount' => 1]))->toThrow(LogicException::class)
        ->and(fn () => $tx->delete())->toThrow(LogicException::class);

    $reversal = $this->ledger->reverse($tx, superAdmin(), 'Mistake');

    expect($reversal->type)->toBe(TransactionType::Reversal)
        ->and($reversal->reversal_of_id)->toBe($tx->id)
        ->and(balance($a))->toBe(1000)
        ->and(balance($b))->toBe(0);

    expect(fn () => $this->ledger->reverse($tx, null, 'again'))->toThrow(BusinessRuleException::class);
});

test('frozen wallets cannot send funds', function () {
    $agent = User::factory()->agent()->create();
    fund($agent, 1000);
    $wallet = $this->wallets->for($agent, Currency::CH, WalletType::Allocation);
    $wallet->forceFill(['is_frozen' => true])->save();

    expect(fn () => $this->ledger->transfer(new TransferRequest(TransactionType::AgentAllocation, Currency::CH, $wallet, $this->wallets->for(User::factory()->create(), Currency::CH), 10)))
        ->toThrow(BusinessRuleException::class, 'frozen');
});

test('reconciliation matches balances against the ledger', function () {
    $a = User::factory()->create();
    fund($a, 1234);

    expect($this->wallets->reconcile()['ok'])->toBeTrue();

    // Tamper with a balance directly (bypassing the ledger) -> detected.
    DB::table('wallets')->where('id', $this->wallets->for($a, Currency::CH)->id)->update(['balance' => 99999]);

    expect($this->wallets->reconcile()['ok'])->toBeFalse();
});

test('the free daily Chips reward is gone for every account type', function () {
    foreach ([User::factory()->player()->create(), User::factory()->agent()->create(), superAdmin()] as $user) {
        expect($this->actingAs($user)->postJson('/api/v1/wallet/daily-reward')->status())->toBeIn([404, 405]);
        $this->actingAs($user)->getJson('/api/v1/wallet')->assertOk()->assertJsonMissingPath('meta.daily_reward_enabled');
    }
    expect(WalletTransaction::query()->where('type', 'DAILY_REWARD')->count())->toBe(0);
});
