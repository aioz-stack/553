<?php

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Enums\WalletType;
use App\Game\AutoArranger;
use App\Models\Agent;
use App\Models\AgentCommission;
use App\Models\AuditLog;
use App\Models\ChipLoad;
use App\Models\GameCard;
use App\Models\GameRoom;
use App\Models\User;
use App\Services\Game\GameEngine;
use App\Services\Game\TableService;
use App\Services\Users\ReferralService;
use App\Services\Users\UserManagementService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/** Register through a referral link (API), then approve as $admin. Returns the active account. */
function apRegister($test, User $admin, ?string $code, string $type, string $username): User
{
    $test->postJson('/api/v1/auth/register', array_filter([
        'name' => ucfirst($username), 'username' => $username, 'email' => "{$username}@t.test",
        'password' => 'secret123', 'password_confirmation' => 'secret123',
        'referral_code' => $code, 'account_type' => $type,
    ]))->assertCreated()->assertJsonPath('data.status', 'pending');

    $user = User::query()->where('username', $username)->firstOrFail();
    $test->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$user->id}/approve")->assertOk()->assertJsonPath('data.status', 'active');

    return $user->fresh(['agent', 'sponsor']);
}

/** Administrator → Agent → Master Agent → Silver Agent, all through Agent Registration Links. */
function apChain($test, User $admin): array
{
    $agent = apRegister($test, $admin, $admin->referral_code ?? app(ReferralService::class)->codeFor($admin), 'agent', 'agentjohn');
    $master = apRegister($test, $admin, $agent->referral_code, 'agent', 'mastermae');
    $silver = apRegister($test, $admin, $master->referral_code, 'agent', 'silverjuan');

    return [$agent, $master, $silver];
}

test('permanent referral links build the hierarchy: Administrator → Agent → Master Agent → Silver Agent → Players', function () {
    $admin = superAdmin();
    $links = $this->actingAs($admin)->getJson('/api/v1/admin/panel/overview')->assertOk()->json('data.links');
    expect($links['player'])->toEndWith("/register/player?ref={$links['code']}")->and($links['agent'])->toEndWith("/register/agent?ref={$links['code']}");
    // The same links every time (permanent).
    expect($this->actingAs($admin)->getJson('/api/v1/admin/panel/overview')->json('data.links'))->toBe($links);

    [$agent, $master, $silver] = apChain($this, $admin);
    expect($agent->agent->level->value)->toBe('agent')->and($agent->agent->parent_agent_id)->toBeNull()->and($agent->sponsor_id)->toBe($admin->id)
        ->and($master->agent->level->value)->toBe('master')->and($master->agent->parent_agent_id)->toBe($agent->agent->id)
        ->and($silver->agent->level->value)->toBe('silver')->and($silver->agent->parent_agent_id)->toBe($master->agent->id);

    // A Silver Agent has a Player link but no Agent link, and its code cannot register agents.
    $this->actingAs($silver)->getJson('/api/v1/agent/panel')->assertOk()
        ->assertJsonPath('data.level', 'silver')->assertJsonPath('data.links.agent', null);
    $this->getJson("/api/v1/auth/referral/{$silver->referral_code}?type=agent")->assertStatus(422)->assertJsonPath('error', 'invalid_referral');

    // Player links: under the Silver Agent (linked on approval) and directly under the Administrator (no agent).
    $p1 = apRegister($this, $admin, $silver->referral_code, 'player', 'playermark');
    $p2 = apRegister($this, $admin, $links['code'], 'player', 'directpat');
    expect($p1->agentLink->agent_id)->toBe($silver->agent->id)->and($p1->sponsor_id)->toBe($silver->id)
        ->and($p2->agentLink)->toBeNull()->and($p2->sponsor_id)->toBe($admin->id);

    // The public lookup tells the registration page who is inviting and what is created.
    $this->getJson("/api/v1/auth/referral/{$master->referral_code}?type=agent")->assertOk()->assertJsonPath('data.level', 'Silver Agent')->assertJsonPath('data.sponsor', 'mastermae');
});

test('referrals are validated on the server: bad codes, players\' codes and agent sign-ups without a link are refused', function () {
    $player = User::factory()->player()->create(['referral_code' => 'PLAYER123']);
    $base = ['name' => 'X', 'email' => 'x@t.test', 'password' => 'secret123', 'password_confirmation' => 'secret123'];

    $this->postJson('/api/v1/auth/register', $base + ['username' => 'xone', 'referral_code' => 'NOPE999'])->assertStatus(422)->assertJsonPath('error', 'invalid_referral');
    $this->postJson('/api/v1/auth/register', $base + ['username' => 'xtwo', 'referral_code' => 'PLAYER123'])->assertStatus(422)->assertJsonPath('error', 'invalid_referral');
    $this->postJson('/api/v1/auth/register', $base + ['username' => 'xthree', 'account_type' => 'agent'])->assertStatus(422)->assertJsonValidationErrors('referral_code');
    expect(User::query()->whereIn('username', ['xone', 'xtwo', 'xthree'])->count())->toBe(0);

    // Players need a registration link too, and the retired per-agent referral codes no longer work.
    $this->postJson('/api/v1/auth/register', $base + ['username' => 'xfour'])->assertStatus(422)->assertJsonValidationErrors('referral_code');
    $agent = User::factory()->agent()->create();
    $legacy = app(\App\Services\Users\UserManagementService::class)->createReferralCode($agent->agent);
    $this->postJson('/api/v1/auth/register', $base + ['username' => 'xfive', 'referral_code' => $legacy->code])->assertStatus(422)->assertJsonPath('error', 'invalid_referral');
    $this->postJson('/api/v1/auth/register', $base + ['username' => 'xsix', 'referral_code' => app(\App\Services\Users\ReferralService::class)->codeFor($agent)])->assertCreated();
    expect(User::query()->whereIn('username', ['xfour', 'xfive'])->count())->toBe(0)
        ->and(User::query()->where('username', 'xsix')->first()->status)->toBe(UserStatus::Pending);
});

test('pending users cannot sign in or use anything until approved; approval and deletion are once only', function () {
    $admin = superAdmin();
    $link = app(\App\Services\Users\ReferralService::class)->codeFor($admin);
    $this->postJson('/api/v1/auth/register', ['name' => 'Pen', 'username' => 'penny', 'email' => 'p@t.test', 'password' => 'secret123', 'password_confirmation' => 'secret123', 'referral_code' => $link])->assertCreated();
    $penny = User::query()->where('username', 'penny')->firstOrFail();

    $this->postJson('/api/v1/auth/login', ['username' => 'penny', 'password' => 'secret123'])->assertForbidden()->assertJsonPath('error', 'account_pending');
    $this->actingAs($penny)->getJson('/api/v1/wallet')->assertForbidden()->assertJsonPath('error', 'account_pending');

    $this->actingAs($admin)->getJson('/api/v1/admin/panel/accounts?kind=pending')->assertOk()->assertJsonPath('data.0.username', 'penny');
    $this->actingAs($admin)->getJson('/api/v1/admin/panel/overview')->assertJsonPath('data.pending_users', 1);

    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$penny->id}/approve")->assertOk();
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$penny->id}/approve")->assertStatus(409);
    $this->postJson('/api/v1/auth/login', ['username' => 'penny', 'password' => 'secret123'])->assertOk();

    // Delete is for pending registrations only.
    $this->actingAs($admin)->deleteJson("/api/v1/admin/panel/accounts/{$penny->id}")->assertStatus(409);
    $this->postJson('/api/v1/auth/register', ['name' => 'Del', 'username' => 'delme', 'email' => 'd@t.test', 'password' => 'secret123', 'password_confirmation' => 'secret123', 'referral_code' => $link])->assertCreated();
    $del = User::query()->where('username', 'delme')->firstOrFail();
    $this->actingAs($admin)->deleteJson("/api/v1/admin/panel/accounts/{$del->id}")->assertOk();
    expect(User::query()->where('username', 'delme')->exists())->toBeFalse();

    // Players and agents cannot use the Admin Panel.
    $this->actingAs($penny->fresh())->getJson('/api/v1/admin/panel/overview')->assertForbidden();
});

test('the sponsor is permanent: a player with an agent cannot be re-assigned', function () {
    $admin = superAdmin();
    [$agent] = apChain($this, $admin);
    $player = apRegister($this, $admin, $agent->referral_code, 'player', 'stayput');
    $other = User::factory()->agent()->create();

    $this->actingAs($admin)->postJson("/api/v1/admin/users/{$player->id}/assign-agent", ['agent_id' => $other->agent->id])->assertStatus(409)->assertJsonPath('error', 'sponsor_locked');
    expect($player->fresh()->agentLink->agent_id)->toBe($agent->agent->id)->and($player->fresh()->sponsor_id)->toBe($agent->id);
});

test('dashboard numbers come from the database: my Chips, active agents by level, active players', function () {
    $admin = superAdmin(); // 1,000,000 Chips float
    [$agent, $master, $silver] = apChain($this, $admin);
    apRegister($this, $admin, $silver->referral_code, 'player', 'pone');
    apRegister($this, $admin, $agent->referral_code, 'player', 'ptwo');
    $banned = apRegister($this, $admin, $master->referral_code, 'player', 'pthree');
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$banned->id}/status", ['action' => 'ban', 'reason' => 'Cheating'])->assertOk();

    $this->actingAs($admin)->getJson('/api/v1/admin/panel/overview')->assertOk()
        ->assertJsonPath('data.my_chips', '1000000.00')
        ->assertJsonPath('data.active_agents.total', 3)->assertJsonPath('data.active_agents.master', 1)->assertJsonPath('data.active_agents.silver', 1)
        ->assertJsonPath('data.active_players', 2)
        ->assertJsonPath('data.banned_users', 1);
});

test('Load Chips and Withdraw Chips move Chips between the admin and the account, validated and logged', function () {
    $admin = superAdmin();
    [$agent] = apChain($this, $admin);
    $player = apRegister($this, $admin, $agent->referral_code, 'player', 'loaded');

    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$agent->id}/load", ['amount' => '50000', 'idempotency_key' => 'k-1'])->assertCreated()
        ->assertJsonPath('data.transaction', 'Load Chips')->assertJsonPath('data.status', 'completed')->assertJsonPath('data.account_type', 'agent')
        ->assertJsonPath('data.processed_by.username', $admin->username);
    // The same request again (double click): one load only.
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$agent->id}/load", ['amount' => '50000', 'idempotency_key' => 'k-1'])->assertCreated();
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$player->id}/load", ['amount' => '20000'])->assertCreated()->assertJsonPath('data.account_type', 'player');

    expect(balance($agent, Currency::CH, WalletType::Allocation))->toBe(50_000_00)
        ->and(balance($player, Currency::CH))->toBe(20_000_00)
        ->and(balance($admin, Currency::CH, WalletType::Allocation))->toBe(930_000_00);

    // Withdraw back; never more than the account holds; never zero or negative.
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$agent->id}/withdraw", ['amount' => '100000'])->assertStatus(422)->assertJsonPath('error', 'insufficient_balance');
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$agent->id}/withdraw", ['amount' => '0'])->assertStatus(422);
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$agent->id}/withdraw", ['amount' => '-5'])->assertStatus(422);
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$agent->id}/withdraw", ['amount' => '10000'])->assertCreated()
        ->assertJsonPath('data.transaction', 'Withdraw Chips')->assertJsonPath('data.signed_amount', '-10000.00');
    expect(balance($agent, Currency::CH, WalletType::Allocation))->toBe(40_000_00)->and(balance($admin, Currency::CH, WalletType::Allocation))->toBe(940_000_00);

    // Load Logs: search, filters, details.
    $logs = $this->actingAs($admin)->getJson('/api/v1/admin/panel/load-logs?q=agentjohn')->assertOk();
    expect(collect($logs->json('data'))->pluck('transaction')->all())->toContain('Load Chips', 'Withdraw Chips');
    $this->actingAs($admin)->getJson('/api/v1/admin/panel/load-logs?direction=withdraw')->assertJsonCount(1, 'data');
    $id = $logs->json('data.0.id');
    $this->actingAs($admin)->getJson("/api/v1/admin/panel/load-logs/{$id}")->assertOk()->assertJsonStructure(['data' => ['ledger' => ['reference', 'destination_balance_after']]]);

    // Not for inactive accounts or by staff without the ability.
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$player->id}/status", ['action' => 'suspend', 'reason' => 'Check'])->assertOk();
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$player->id}/load", ['amount' => '1'])->assertStatus(409);
    $limited = User::factory()->create(['role' => Role::Administrator]);
    $this->actingAs($limited)->postJson("/api/v1/admin/panel/accounts/{$agent->id}/load", ['amount' => '1'])->assertForbidden();
    expect(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('agents request Chips (Pending); staff approve from their own Chips or reject', function () {
    $admin = superAdmin();
    [$agent] = apChain($this, $admin);

    $this->actingAs($agent)->postJson('/api/v1/agent/chip-requests', ['amount' => '5000', 'note' => 'Weekend'])->assertCreated()->assertJsonPath('data.status', 'pending');
    $this->actingAs($agent)->postJson('/api/v1/agent/chip-requests', ['amount' => '700'])->assertCreated();
    [$first, $second] = ChipLoad::query()->where('direction', 'request')->orderBy('id')->get()->all();

    $this->actingAs($admin)->getJson('/api/v1/admin/panel/load-logs?status=pending')->assertJsonCount(2, 'data')->assertJsonPath('meta.counts.pending', 2);
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/load-logs/{$first->id}/approve")->assertOk()->assertJsonPath('data.status', 'completed');
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/load-logs/{$first->id}/approve")->assertStatus(409);
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/load-logs/{$second->id}/reject", ['note' => 'Too soon'])->assertOk()->assertJsonPath('data.status', 'rejected');

    expect(balance($agent, Currency::CH, WalletType::Allocation))->toBe(5_000_00)
        // The approval's ledger movement is recorded on the request row itself (no second Load Logs row).
        ->and(ChipLoad::query()->where('account_id', $agent->id)->count())->toBe(2)
        ->and($first->fresh()->wallet_transaction_id)->not->toBeNull();
    $this->actingAs($agent)->getJson('/api/v1/agent/panel')->assertJsonPath('data.chips', '5000.00')->assertJsonPath('data.chip_requests.0.status', 'rejected');
    // Players cannot request Chips.
    $player = apRegister($this, $admin, $agent->referral_code, 'player', 'noreq');
    $this->actingAs($player)->postJson('/api/v1/agent/chip-requests', ['amount' => '1'])->assertForbidden();
});

test('commissions flow up the hierarchy: the direct sponsor earns its rate, each upline its override', function () {
    $admin = superAdmin();
    [$agent, $master, $silver] = apChain($this, $admin);
    $room = GameRoom::factory()->create(['entry_amount' => 2500, 'platform_fee_bps' => 1000]); // fee 1000, 250 per player
    $tables = app(TableService::class);
    $players = [];
    foreach (range(1, 4) as $i) {
        $p = apRegister($this, $admin, $silver->referral_code, 'player', "silverp{$i}");
        fund($p, $room->entry_amount);
        $seat = $tables->join($p, $room);
        $players[] = $p;
    }
    foreach ($players as $p) {
        $tables->setReady($p, $seat->table, true);
    }
    $session = $seat->table->fresh()->currentSession;
    foreach ($players as $p) {
        $a = AutoArranger::arrange(GameCard::query()->where('game_session_id', $session->id)->where('user_id', $p->id)->value('cards'));
        app(GameEngine::class)->submit($p, $session, $a->front, $a->middle, $a->back);
    }

    $byAgent = AgentCommission::query()->where('game_session_id', $session->id)->get()->groupBy('agent_id');
    // Per player (250): Silver 30% = 75, Master 40−30 = 10% = 25, Agent 50−40 = 10% = 25.
    expect($byAgent[$silver->agent->id]->sum('amount'))->toBe(300)->and($byAgent[$silver->agent->id]->first()->note)->toBe('direct')
        ->and($byAgent[$master->agent->id]->sum('amount'))->toBe(100)->and($byAgent[$master->agent->id]->first()->note)->toBe('override')
        ->and($byAgent[$agent->agent->id]->sum('amount'))->toBe(100)
        ->and(AgentCommission::query()->sum('amount'))->toBe(500); // never more than the top rate (50%)

    $logs = $this->actingAs($admin)->getJson('/api/v1/admin/panel/commission-logs')->assertOk();
    expect($logs->json('meta.breakdown.silver.total'))->toBe('3.00')->and($logs->json('meta.breakdown.master.total'))->toBe('1.00')
        ->and($logs->json('meta.rates'))->toBe(['agent' => 50, 'master' => 40, 'silver' => 30]);
    $this->actingAs($admin)->getJson('/api/v1/admin/panel/commission-logs?level=master')->assertJsonCount(4, 'data');

    // Rates per level, and one account's own override.
    $this->actingAs($admin)->putJson('/api/v1/admin/panel/commission-rates', ['agent' => 45, 'master' => 35, 'silver' => 20])->assertOk()->assertJsonPath('data.silver', 20);
    $this->actingAs($admin)->putJson("/api/v1/admin/panel/accounts/{$silver->id}/commission-rate", ['rate' => 25])->assertOk()->assertJsonPath('data.commission_rate', 25);
    $this->actingAs($agent)->putJson('/api/v1/admin/panel/commission-rates', ['agent' => 99, 'master' => 1, 'silver' => 1])->assertForbidden();
});

test('ban, suspend, reactivate, archive and restore: blocked accounts are signed out and refused; history is kept', function () {
    $admin = superAdmin();
    [$agent] = apChain($this, $admin);
    $player = apRegister($this, $admin, $agent->referral_code, 'player', 'troublemaker');
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$player->id}/load", ['amount' => '100'])->assertCreated();
    $token = $this->postJson('/api/v1/auth/login', ['username' => 'troublemaker', 'password' => 'secret123'])->assertOk()->json('data.token');

    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$player->id}/status", ['action' => 'ban'])->assertUnprocessable(); // reason required
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$player->id}/status", ['action' => 'ban', 'reason' => 'Collusion'])->assertOk()
        ->assertJsonPath('data.status', 'banned')->assertJsonPath('data.status_reason', 'Collusion');
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/v1/wallet')->assertUnauthorized(); // token revoked
    $this->postJson('/api/v1/auth/login', ['username' => 'troublemaker', 'password' => 'secret123'])->assertForbidden()->assertJsonPath('error', 'banned');
    $this->actingAs($admin)->getJson('/api/v1/admin/panel/accounts?kind=banned')->assertJsonPath('data.0.username', 'troublemaker');
    $this->actingAs($admin)->getJson('/api/v1/admin/panel/accounts?kind=players')->assertJsonCount(0, 'data');

    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$player->id}/status", ['action' => 'reactivate'])->assertOk()->assertJsonPath('data.status', 'active');
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$player->id}/status", ['action' => 'archive', 'reason' => 'Left'])->assertOk()->assertJsonPath('data.status', 'archived');
    $this->postJson('/api/v1/auth/login', ['username' => 'troublemaker', 'password' => 'secret123'])->assertForbidden()->assertJsonPath('error', 'archived');

    // The archive keeps the account, its sponsor and its transactions.
    $this->actingAs($admin)->getJson('/api/v1/admin/panel/accounts?kind=archived&q=trouble')->assertJsonPath('data.0.sponsor.username', 'agentjohn');
    $this->actingAs($admin)->getJson("/api/v1/admin/panel/accounts/{$player->id}")->assertOk()->assertJsonCount(1, 'data.transactions');
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$player->id}/status", ['action' => 'restore'])->assertOk()->assertJsonPath('data.status', 'active');
    expect(balance($player->fresh(), Currency::CH))->toBe(100_00)->and(AuditLog::query()->where('action', 'user.status')->count())->toBe(4);

    // Nobody can block a Super Admin or themselves.
    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$admin->id}/status", ['action' => 'ban', 'reason' => 'x'])->assertForbidden();
});

test('administrators need the matching ability for account actions', function () {
    $admin = User::factory()->create(['role' => Role::Administrator]);
    $this->postJson('/api/v1/auth/register', ['name' => 'Q', 'username' => 'queued', 'email' => 'q@t.test', 'password' => 'secret123', 'password_confirmation' => 'secret123', 'referral_code' => app(\App\Services\Users\ReferralService::class)->codeFor(superAdmin())])->assertCreated();
    $queued = User::query()->where('username', 'queued')->firstOrFail();

    $this->actingAs($admin)->postJson("/api/v1/admin/panel/accounts/{$queued->id}/approve")->assertForbidden();
    $admin->permissions()->attach(\App\Models\Permission::query()->where('key', Ability::ManagePlayers->value)->pluck('id'));
    $this->actingAs($admin->fresh())->postJson("/api/v1/admin/panel/accounts/{$queued->id}/approve")->assertOk();
});
