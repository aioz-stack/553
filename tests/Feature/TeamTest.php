<?php

use App\Enums\CommissionStatus;
use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Models\AgentCommission;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Users\ReferralService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/** Register through a link and approve (the real referral flow). */
function tmJoin(User $admin, ?string $code, string $type, string $username): User
{
    $user = app(ReferralService::class)->register(['name' => $username, 'username' => $username, 'email' => "{$username}@t.test", 'password' => 'secret123'], $code, $type);

    return app(ReferralService::class)->approve($admin, $user);
}

/** Give an agent commission (as if approved commissions had been paid into its commission wallet). */
function tmCommission(User $agent, int $minor): void
{
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::CommissionPayment, Currency::CH, null, app(WalletService::class)->for($agent, Currency::CH, WalletType::Commission), $minor));
}

test('convert commission to wallet: minimum 10 Chips, never more than available, once per request, balances updated at once', function () {
    $agent = User::factory()->agent()->create();
    tmCommission($agent, 5000); // 50.00 Chips

    $this->actingAs($agent)->getJson('/api/v1/commission/wallet')->assertOk()
        ->assertJsonPath('data.balance', '50.00')->assertJsonPath('data.available', '50.00')->assertJsonPath('data.min_conversion', 10);

    $this->actingAs($agent)->postJson('/api/v1/commission/convert', ['amount' => '9.99', 'request_id' => 'a1'])->assertStatus(422)->assertJsonPath('error', 'below_minimum');
    $this->actingAs($agent)->postJson('/api/v1/commission/convert', ['amount' => '50.01', 'request_id' => 'a2'])->assertStatus(422)->assertJsonPath('error', 'insufficient_commission');
    $this->actingAs($agent)->postJson('/api/v1/commission/convert', ['amount' => '-5', 'request_id' => 'a3'])->assertStatus(422);
    $this->actingAs($agent)->postJson('/api/v1/commission/convert', ['amount' => '30'])->assertStatus(422)->assertJsonValidationErrors('request_id');

    $this->actingAs($agent)->postJson('/api/v1/commission/convert', ['amount' => '30', 'request_id' => 'ok-1'])->assertOk()
        ->assertJsonPath('data.balance', '20.00')->assertJsonPath('data.converted_now', '30.00');
    // Double click / retry with the same request: converted once.
    $this->actingAs($agent)->postJson('/api/v1/commission/convert', ['amount' => '30', 'request_id' => 'ok-1'])->assertOk()->assertJsonPath('data.balance', '20.00');

    expect(balance($agent, Currency::CH, WalletType::Commission))->toBe(2000)
        ->and(balance($agent, Currency::CH, WalletType::Allocation))->toBe(3000)
        ->and(WalletTransaction::query()->where('type', TransactionType::CommissionConversion->value)->count())->toBe(1)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('pending withdrawal requests are reserved: conversion only uses what is left', function () {
    $agent = User::factory()->agent()->create();
    tmCommission($agent, 5000);
    $this->actingAs($agent)->postJson('/api/v1/agent/payout-requests', ['amount' => '35'])->assertCreated();

    $this->actingAs($agent)->getJson('/api/v1/commission/wallet')->assertJsonPath('data.available', '15.00')->assertJsonPath('data.pending', '35.00');
    $this->actingAs($agent)->postJson('/api/v1/commission/convert', ['amount' => '20', 'request_id' => 'r1'])->assertStatus(422);
    $this->actingAs($agent)->postJson('/api/v1/commission/convert', ['amount' => '15', 'request_id' => 'r2'])->assertOk();
});

test('only administrators and agents can convert commission or see a team; players cannot', function () {
    $player = User::factory()->player()->create();
    $this->actingAs($player)->getJson('/api/v1/commission/wallet')->assertForbidden();
    $this->actingAs($player)->postJson('/api/v1/commission/convert', ['amount' => '10', 'request_id' => 'x'])->assertForbidden();
    $this->actingAs($player)->getJson('/api/v1/team/overview')->assertForbidden();

    // Administrators can open it (no commission earned → nothing to convert).
    $admin = superAdmin();
    $this->actingAs($admin)->getJson('/api/v1/commission/wallet')->assertOk()->assertJsonPath('data.balance', '0.00');
    $this->actingAs($admin)->postJson('/api/v1/commission/convert', ['amount' => '10', 'request_id' => 'y'])->assertStatus(422)->assertJsonPath('error', 'insufficient_commission');
});

test('team overview totals only the user\'s own downline, at every level', function () {
    $super = superAdmin();
    $agent = tmJoin($super, app(ReferralService::class)->codeFor($super), 'agent', 'teamagent');
    $master = tmJoin($super, $agent->referral_code, 'agent', 'teammaster');
    $silver = tmJoin($super, $master->referral_code, 'agent', 'teamsilver');
    $pA = tmJoin($super, $agent->referral_code, 'player', 'playera');
    $pS = tmJoin($super, $silver->referral_code, 'player', 'players1');
    $outsider = User::factory()->agent()->create();
    $outsiderPlayer = User::factory()->player()->create();

    // Chips: players 100 + 200; agents' wallets 1,000 / 2,000 / 3,000; outsiders 9,999.
    foreach ([[$pA, 10_000], [$pS, 20_000], [$outsiderPlayer, 999_900]] as [$u, $minor]) {
        fund($u, $minor);
    }
    foreach ([[$agent, 100_000], [$master, 200_000], [$silver, 300_000], [$outsider, 999_900]] as [$u, $minor]) {
        fund($u, $minor);
    }
    // Commissions earned: master 40, silver 70 (+ a reversed 99 that does not count), outsider 500.
    $row = fn (User $u, int $amount, CommissionStatus $status, int $session) => AgentCommission::create(['agent_id' => $u->agent->id, 'player_id' => $pS->id, 'game_session_id' => $session, 'currency' => 'CH', 'fee_basis' => 1, 'rate_bps' => 1, 'amount' => $amount, 'status' => $status]);
    $row($master, 4000, CommissionStatus::Paid, 1);
    $row($silver, 7000, CommissionStatus::Pending, 1);
    $row($silver, 9900, CommissionStatus::Reversed, 2);
    $row($outsider, 50000, CommissionStatus::Paid, 1);

    // The Agent: Master + Silver (their wallets 2,000 + 3,000), both players, commission 40 + 70.
    $this->actingAs($agent)->getJson('/api/v1/team/overview')->assertOk()
        ->assertJsonPath('data.total_player_wallets', '300.00')
        ->assertJsonPath('data.total_agent_wallets', '5000.00')
        ->assertJsonMissingPath('data.agents_commission')
        ->assertJsonPath('data.agents', 2)->assertJsonPath('data.players', 2);

    // The Master: only the Silver Agent and the Silver's player.
    $this->actingAs($master)->getJson('/api/v1/team/overview')
        ->assertJsonPath('data.total_player_wallets', '200.00')->assertJsonPath('data.total_agent_wallets', '3000.00');

    // The Silver Agent: its player only; no agents below it.
    $this->actingAs($silver)->getJson('/api/v1/team/overview')
        ->assertJsonPath('data.total_player_wallets', '200.00')->assertJsonPath('data.total_agent_wallets', '0.00')->assertJsonPath('data.agents', 0);

    // An agent outside the tree sees nothing of it.
    $this->actingAs($outsider)->getJson('/api/v1/team/overview')->assertJsonPath('data.players', 0)->assertJsonPath('data.total_agent_wallets', '0.00');

    // The Super Admin sees the whole platform.
    $this->actingAs($super)->getJson('/api/v1/team/overview')->assertJsonPath('data.scope', 'platform')
        ->assertJsonPath('data.total_player_wallets', '10299.00');
});

test('an administrator\'s totals include players linked to agents below it, counted once, at every level', function () {
    $super = superAdmin();
    $admin = User::factory()->create(['role' => 'admin']);
    app(ReferralService::class)->codeFor($admin);
    $agent = tmJoin($super, $admin->referral_code, 'agent', 'lvlagent');
    $master = tmJoin($super, $agent->referral_code, 'agent', 'lvlmaster');
    $silver = tmJoin($super, $master->referral_code, 'agent', 'lvlsilver');
    $direct = tmJoin($super, $agent->referral_code, 'player', 'lvldirect');
    $deep = tmJoin($super, $silver->referral_code, 'player', 'lvldeep');
    // A player sponsored elsewhere but linked to the Master Agent (agent_players) still counts — once.
    $linked = User::factory()->player()->create();
    \App\Models\AgentPlayer::create(['agent_id' => $master->agent->id, 'player_id' => $linked->id, 'assigned_at' => now()]);
    \App\Models\AgentPlayer::query()->updateOrCreate(['player_id' => $deep->id], ['agent_id' => $silver->agent->id, 'assigned_at' => now()]);
    foreach ([[$direct, 1_000], [$deep, 2_000], [$linked, 4_000], [$agent, 10_000], [$master, 20_000], [$silver, 40_000]] as [$u, $minor]) {
        fund($u, $minor);
    }

    $this->actingAs($admin)->getJson('/api/v1/team/overview')->assertOk()
        ->assertJsonPath('data.players', 3)->assertJsonPath('data.agents', 3)
        ->assertJsonPath('data.total_player_wallets', '70.00')
        ->assertJsonPath('data.total_agent_wallets', '700.00');
    $this->actingAs($master)->getJson('/api/v1/team/overview')
        ->assertJsonPath('data.total_player_wallets', '60.00')->assertJsonPath('data.total_agent_wallets', '400.00');
});

test('an administrator\'s team is everyone registered under them', function () {
    $super = superAdmin();
    $admin = User::factory()->create(['role' => 'admin']);
    app(ReferralService::class)->codeFor($admin);
    $mine = tmJoin($super, $admin->referral_code, 'agent', 'adminsagent');
    $player = tmJoin($super, $mine->referral_code, 'player', 'adminsplayer');
    $notMine = tmJoin($super, app(ReferralService::class)->codeFor($super), 'agent', 'superagent');
    fund($player, 5_000);
    fund($notMine, 7_000);

    $this->actingAs($admin)->getJson('/api/v1/team/overview')->assertOk()
        ->assertJsonPath('data.agents', 1)->assertJsonPath('data.players', 1)
        ->assertJsonPath('data.total_player_wallets', '50.00')->assertJsonPath('data.total_agent_wallets', '0.00');
});

test('the dummy agents seeder gives each dummy agent 200 Chips of convertible commission, once', function () {
    superAdmin();
    $this->seed(\Database\Seeders\DummyAgentsSeeder::class);
    $this->seed(\Database\Seeders\DummyAgentsSeeder::class); // re-run: nothing doubles

    foreach (['dummyagent' => 'agent', 'dummymaster' => 'master', 'dummysilver' => 'silver'] as $username => $level) {
        $u = User::query()->where('username', $username)->firstOrFail();
        expect($u->agent->level->value)->toBe($level)
            ->and(balance($u, Currency::CH, WalletType::Commission))->toBe(200_00);
        $this->actingAs($u)->getJson('/api/v1/commission/wallet')->assertJsonPath('data.available', '200.00');
    }
    $this->actingAs(User::query()->where('username', 'dummyagent')->first())->getJson('/api/v1/team/overview')
        ->assertJsonPath('data.agents', 2)->assertJsonPath('data.players', 1);
    expect(AgentCommission::query()->count())->toBe(3)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});
