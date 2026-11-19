<?php

use App\Enums\CommissionStatus;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Game\AutoArranger;
use App\Models\AgentCommission;
use App\Models\AgentCommissionRule;
use App\Models\GameCard;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\User;
use App\Services\Agent\CommissionService;
use App\Services\Game\GameEngine;
use App\Services\Game\TableService;
use App\Services\Users\UserManagementService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class); // default 40% rule
});

/**
 * Plays a full game where all four players belong to one agent.
 */
function playAgentGame(User $agent, GameRoom $room): GameSession
{
    $tables = app(TableService::class);
    $players = [];

    foreach (range(1, 4) as $i) {
        $player = app(UserManagementService::class)->create($agent, Role::Player, [
            'name' => "Agent player {$i}", 'username' => 'ap'.uniqid(), 'email' => uniqid().'@t.test', 'password' => 'password',
        ]);
        fund($player, $room->entry_amount);
        $seat = $tables->join($player, $room);
        $players[] = $player;
    }

    foreach ($players as $player) {
        $tables->setReady($player, $seat->table, true);
    }

    $session = $seat->table->fresh()->currentSession;

    foreach ($players as $player) {
        $cards = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $player->id)->value('cards');
        $a = AutoArranger::arrange($cards);
        app(GameEngine::class)->submit($player, $session, $a->front, $a->middle, $a->back);
    }

    return $session->fresh();
}

test('commissions are a percentage of the platform fee collected from the agent players', function () {
    $agent = User::factory()->agent()->create();
    $room = GameRoom::factory()->create(['entry_amount' => 2500, 'platform_fee_bps' => 1000]); // pot 10000, fee 1000

    $session = playAgentGame($agent, $room);

    $commissions = AgentCommission::query()->where('game_session_id', $session->id)->get();

    // Fee 1000 attributed 250 per player; an Agent's level rate is 50% = 125 each → 500 total.
    expect($session->platform_fee)->toBe(1000)
        ->and($commissions)->toHaveCount(4)
        ->and($commissions->sum('amount'))->toBe(500)
        ->and($commissions->first()->rate_bps)->toBe(5000)
        ->and($commissions->first()->fee_basis)->toBe(250)
        ->and($commissions->every(fn ($c) => $c->status === CommissionStatus::Pending))->toBeTrue();
});

test('retrying settlement never duplicates commissions', function () {
    $agent = User::factory()->agent()->create();
    $session = playAgentGame($agent, GameRoom::factory()->create());

    app(CommissionService::class)->generateForSession($session, $session->settlement->breakdown['fee_attribution']);

    expect(AgentCommission::query()->where('game_session_id', $session->id)->count())->toBe(4);
});

test('approving a VC commission pays it into the separate commission wallet', function () {
    $super = superAdmin();
    $agent = User::factory()->agent()->create();
    $session = playAgentGame($agent, GameRoom::factory()->create());
    $commission = AgentCommission::query()->where('game_session_id', $session->id)->first();

    app(CommissionService::class)->approve($super, $commission);

    expect($commission->fresh()->status)->toBe(CommissionStatus::Paid)
        ->and(balance($agent, Currency::CH, WalletType::Commission))->toBe($commission->amount)
        ->and(balance($agent, Currency::CH, WalletType::Allocation))->toBe(0)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();

    app(CommissionService::class)->reverse($super, $commission->fresh(), 'Chargeback test');

    expect($commission->fresh()->status)->toBe(CommissionStatus::Reversed)
        ->and(balance($agent, Currency::CH, WalletType::Commission))->toBe(0);
});

test('agents cannot approve commissions or change their own rates', function () {
    $agent = User::factory()->agent()->create();
    $session = playAgentGame($agent, GameRoom::factory()->create());
    $commission = AgentCommission::query()->where('game_session_id', $session->id)->first();

    expect(fn () => app(CommissionService::class)->approve($agent, $commission))->toThrow(BusinessRuleException::class);

    $this->actingAs($agent)->postJson('/api/v1/admin/commission-rules', ['rate_bps' => 9000])->assertForbidden();
});

test('agent specific rules override the platform default and are snapshotted', function () {
    $agent = User::factory()->agent()->create();
    AgentCommissionRule::create(['agent_id' => $agent->agent->id, 'rate_bps' => 5000, 'is_active' => true]);

    $session = playAgentGame($agent, GameRoom::factory()->create());
    $commission = AgentCommission::query()->where('game_session_id', $session->id)->first();

    AgentCommissionRule::query()->update(['rate_bps' => 100]);

    expect($commission->fresh()->rate_bps)->toBe(5000);
});

test('cancelled games generate no commissions', function () {
    $agent = User::factory()->agent()->create();
    [, $session] = startGame();
    app(GameEngine::class)->cancel($session, superAdmin(), 'test');

    expect(app(CommissionService::class)->generateForSession($session->fresh(), [1 => 1000]))->toBe([]);
});
