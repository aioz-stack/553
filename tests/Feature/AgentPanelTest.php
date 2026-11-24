<?php

use App\Enums\CommissionStatus;
use App\Enums\Currency;
use App\Enums\WalletType;
use App\Events\PanelUpdated;
use App\Models\AgentCommission;
use App\Models\ChipLoad;
use App\Models\User;
use App\Services\Agent\PayoutService;
use App\Services\Users\ReferralService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

function agpJoin(User $admin, string $code, string $type, string $username): User
{
    $user = app(ReferralService::class)->register(['name' => $username, 'username' => $username, 'email' => "{$username}@t.test", 'password' => 'secret123'], $code, $type);

    return app(ReferralService::class)->approve($admin, $user);
}

/** Agent → Master → Silver, one player each, plus an unrelated agent with its own player. */
function agpTree(): array
{
    $super = superAdmin();
    $agent = agpJoin($super, app(ReferralService::class)->codeFor($super), 'agent', 'tagent');
    $master = agpJoin($super, $agent->referral_code, 'agent', 'tmaster');
    $silver = agpJoin($super, $master->referral_code, 'agent', 'tsilver');
    $pAgent = agpJoin($super, $agent->referral_code, 'player', 'pagent');
    $pMaster = agpJoin($super, $master->referral_code, 'player', 'pmaster');
    $pSilver = agpJoin($super, $silver->referral_code, 'player', 'psilver');
    $other = agpJoin($super, app(ReferralService::class)->codeFor($super), 'agent', 'tother');
    $pOther = agpJoin($super, $other->referral_code, 'player', 'pother');

    foreach ([$agent, $master, $silver, $other] as $u) {
        fund($u, 100_000);
    }

    return compact('super', 'agent', 'master', 'silver', 'pAgent', 'pMaster', 'pSilver', 'other', 'pOther');
}

test('the Master Agent panel shows its own downline only, with the same screens as the Admin Panel', function () {
    $t = agpTree();
    $this->actingAs($t['master']);

    $this->getJson('/api/v1/agent/panel/overview')->assertOk()
        ->assertJsonPath('data.level', 'master')
        ->assertJsonPath('data.upline.username', 'tagent')
        ->assertJsonPath('data.my_chips', '1000.00')
        ->assertJsonPath('data.active_agents.total', 1)->assertJsonPath('data.active_agents.silver', 1)
        ->assertJsonPath('data.active_players', 2)->assertJsonPath('data.my_players', 1);

    $players = collect($this->getJson('/api/v1/agent/panel/accounts?kind=players')->assertOk()->json('data'));
    expect($players->pluck('username')->sort()->values()->all())->toBe(['pmaster', 'psilver'])
        // Chips can be loaded only to the players registered to this agent.
        ->and($players->firstWhere('username', 'pmaster')['can_load'])->toBeTrue()
        ->and($players->firstWhere('username', 'psilver')['can_load'])->toBeFalse();
    expect(collect($this->getJson('/api/v1/agent/panel/accounts?kind=agents')->json('data'))->pluck('username')->all())->toBe(['tsilver']);

    // Nothing outside the tree, upward or sideways.
    foreach (['pother', 'tagent', 'pagent', 'tother'] as $username) {
        $this->getJson('/api/v1/agent/panel/accounts/'.User::query()->where('username', $username)->value('id'))->assertNotFound();
    }
    $this->getJson("/api/v1/agent/panel/accounts/{$t['pSilver']->id}")->assertOk()->assertJsonPath('data.username', 'psilver');

    // Load Logs: the master's own loads and its downline's, never the outsider's.
    $loads = collect($this->getJson('/api/v1/agent/panel/load-logs?per_page=100')->assertOk()->json('data'));
    expect($loads->pluck('account.username')->unique()->sort()->values()->all())->toBe(['tmaster', 'tsilver'])
        ->and($this->getJson('/api/v1/agent/panel/load-logs/'.ChipLoad::query()->where('account_id', $t['other']->id)->value('id'))->status())->toBe(404);
});

test('an agent loads Chips to its own players from the panel, and nothing else', function () {
    Event::fake([PanelUpdated::class]);
    $t = agpTree();
    $this->actingAs($t['master']);

    $this->postJson("/api/v1/agent/panel/accounts/{$t['pMaster']->id}/load", ['amount' => '250', 'idempotency_key' => 'k1'])->assertCreated()
        ->assertJsonPath('data.direction', 'load')->assertJsonPath('data.sender.username', 'tmaster');
    $this->postJson("/api/v1/agent/panel/accounts/{$t['pMaster']->id}/load", ['amount' => '250', 'idempotency_key' => 'k1'])->assertCreated(); // retry: once
    expect(balance($t['pMaster'], Currency::CH, WalletType::Player))->toBe(25_000)
        ->and(balance($t['master'], Currency::CH, WalletType::Allocation))->toBe(75_000);

    // A downline agent's player is not the master's own; outsiders are invisible; no overdraft.
    $this->postJson("/api/v1/agent/panel/accounts/{$t['pSilver']->id}/load", ['amount' => '10'])->assertForbidden();
    $this->postJson("/api/v1/agent/panel/accounts/{$t['pOther']->id}/load", ['amount' => '10'])->assertNotFound();
    $this->postJson("/api/v1/agent/panel/accounts/{$t['silver']->id}/load", ['amount' => '10'])->assertNotFound();
    $this->postJson("/api/v1/agent/panel/accounts/{$t['pMaster']->id}/load", ['amount' => '999999'])->assertStatus(422)->assertJsonPath('error', 'insufficient_balance');

    // Real time: the player, the master and the whole upline are told to refresh.
    Event::assertDispatched(PanelUpdated::class, fn (PanelUpdated $e) => $e->kind === 'load'
        && empty(array_diff([$t['pMaster']->id, $t['master']->id, $t['agent']->id, $t['super']->id], $e->userIds)));
    expect(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('agents cannot use any Administrator action', function () {
    $t = agpTree();
    $request = ChipLoad::create(['reference' => 'RQX', 'direction' => ChipLoad::REQUEST, 'account_id' => $t['silver']->id, 'account_type' => 'silver', 'amount' => 100, 'status' => ChipLoad::PENDING]);
    $pending = app(ReferralService::class)->register(['name' => 'Wait', 'username' => 'waiting', 'email' => 'w@t.test', 'password' => 'secret123'], $t['master']->referral_code, 'player');
    $this->actingAs($t['master']);

    $this->getJson('/api/v1/admin/panel/overview')->assertForbidden();
    $this->getJson('/api/v1/admin/panel/accounts?kind=players')->assertForbidden();
    $this->postJson("/api/v1/admin/panel/accounts/{$t['pMaster']->id}/withdraw", ['amount' => '1'])->assertForbidden();
    $this->postJson("/api/v1/admin/panel/accounts/{$pending->id}/approve")->assertForbidden();
    $this->postJson("/api/v1/admin/panel/load-logs/{$request->id}/approve")->assertForbidden();
    // The agent panel has no such routes at all.
    expect($this->postJson("/api/v1/agent/panel/load-logs/{$request->id}/approve")->status())->toBeIn([404, 405])
        ->and($this->postJson("/api/v1/agent/panel/accounts/{$pending->id}/approve")->status())->toBeIn([404, 405])
        ->and($this->postJson("/api/v1/agent/panel/accounts/{$t['pMaster']->id}/withdraw", ['amount' => '1'])->status())->toBeIn([404, 405])
        ->and($this->postJson("/api/v1/agent/panel/accounts/{$t['pMaster']->id}/status", ['action' => 'ban', 'reason' => 'x'])->status())->toBeIn([404, 405]);

    // It sees its pending registration, read-only.
    $this->getJson('/api/v1/agent/panel/accounts?kind=pending')->assertOk()->assertJsonPath('data.0.username', 'waiting');
    expect($pending->fresh()->status->value)->toBe('pending')->and($request->fresh()->status)->toBe(ChipLoad::PENDING);

    // Players have no panel.
    $this->actingAs($t['pMaster'])->getJson('/api/v1/agent/panel/overview')->assertForbidden();
});

test('commission logs and withdrawals cover the agent and the agents below it', function () {
    $t = agpTree();
    $row = fn (User $u, int $amount, int $session) => AgentCommission::create(['agent_id' => $u->agent->id, 'player_id' => $t['pSilver']->id, 'game_session_id' => $session, 'currency' => 'CH', 'fee_basis' => 1, 'rate_bps' => 1, 'amount' => $amount, 'status' => CommissionStatus::Paid]);
    $row($t['agent'], 100, 1);
    $row($t['master'], 200, 1);
    $row($t['silver'], 300, 1);
    $row($t['other'], 400, 1);
    // Commission to withdraw: the master asks for part of it.
    app(\App\Services\Wallet\LedgerService::class)->transfer(new \App\Services\Wallet\TransferRequest(\App\Enums\TransactionType::CommissionPayment, Currency::CH, null, app(WalletService::class)->for($t['master'], Currency::CH, WalletType::Commission), 5_000));
    app(PayoutService::class)->request($t['master']->agent, Currency::CH, 2_000, $t['master']);
    app(\App\Services\Wallet\LedgerService::class)->transfer(new \App\Services\Wallet\TransferRequest(\App\Enums\TransactionType::CommissionPayment, Currency::CH, null, app(WalletService::class)->for($t['other'], Currency::CH, WalletType::Commission), 5_000));
    app(PayoutService::class)->request($t['other']->agent, Currency::CH, 1_000, $t['other']);

    $this->actingAs($t['master']);
    $logs = collect($this->getJson('/api/v1/agent/panel/commission-logs')->assertOk()->json('data'));
    expect($logs->pluck('recipient.username')->sort()->values()->all())->toBe(['tmaster', 'tsilver']);

    $this->getJson('/api/v1/agent/panel/withdrawals')->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('data.0.agent.username', 'tmaster')
        ->assertJsonPath('meta.summary.available', '30.00')->assertJsonPath('meta.summary.pending', '20.00')->assertJsonPath('meta.summary.pending_count', 1);

    // The top agent sees all three levels of its tree.
    expect(collect($this->actingAs($t['agent'])->getJson('/api/v1/agent/panel/commission-logs')->json('data'))->pluck('recipient.username')->sort()->values()->all())
        ->toBe(['tagent', 'tmaster', 'tsilver']);
});

test('the Silver Agent panel has no agents below it but the same overview', function () {
    $t = agpTree();
    $this->actingAs($t['silver'])->getJson('/api/v1/agent/panel/overview')->assertOk()
        ->assertJsonPath('data.level', 'silver')->assertJsonPath('data.links.agent', null)
        ->assertJsonPath('data.active_agents.total', 0)->assertJsonPath('data.active_players', 1);
    $this->actingAs($t['silver'])->getJson('/api/v1/agent/panel/accounts?kind=agents')->assertOk()->assertJsonCount(0, 'data');
});
