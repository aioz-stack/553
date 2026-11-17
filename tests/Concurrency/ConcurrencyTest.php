<?php

/*
| Real concurrency tests against MySQL/MariaDB (row locks do not exist in
| SQLite). Each scenario launches several PHP processes at the same moment.
|
| Run:  php artisan test --configuration=phpunit.mysql.xml
| Uses the separate database `553_testing` (created if missing) so the
| development database `553` is never wiped.
*/

use App\Enums\Currency;
use App\Enums\GameStatus;
use App\Enums\WalletType;
use App\Models\GameBet;
use App\Models\GameCard;
use App\Models\GamePayout;
use App\Models\GamePlayer;
use App\Models\GameRoom;
use App\Models\GameSettlement;
use App\Models\User;
use App\Models\WalletAllocation;
use App\Models\WalletHold;
use App\Models\WalletTransaction;
use App\Services\Game\GameEngine;
use App\Services\Game\TableService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

uses(TestCase::class);

beforeEach(function () {
    if (config('database.default') !== 'mysql') {
        $this->markTestSkipped('Concurrency tests need MySQL: php artisan test --configuration=phpunit.mysql.xml');
    }

    Artisan::call('migrate:fresh', ['--force' => true]);
    $this->seed(RolesAndPermissionsSeeder::class);
});

/**
 * Run the worker N times in parallel and return decoded results.
 *
 * @param  list<array{0: string, 1: array<string, mixed>}>  $jobs
 * @return list<array<string, mixed>>
 */
function race(array $jobs): array
{
    $env = [
        'APP_ENV' => 'testing',
        'DB_CONNECTION' => 'mysql',
        'DB_DATABASE' => config('database.connections.mysql.database'),
        'QUEUE_CONNECTION' => 'sync',
        'BROADCAST_CONNECTION' => 'null',
        'CACHE_STORE' => 'array',
    ];

    $pool = Process::pool(function ($pool) use ($jobs, $env) {
        foreach ($jobs as [$action, $args]) {
            $pool->path(base_path())->env($env)->timeout(120)
                ->command([PHP_BINARY, 'tests/Concurrency/worker.php', $action, json_encode($args)]);
        }
    })->start()->wait();

    return array_map(function ($result) {
        $decoded = json_decode(trim($result->output()), true);

        return $decoded ?? ['ok' => false, 'error' => 'crash', 'message' => $result->output().$result->errorOutput()];
    }, $pool->collect()->all());
}

test('parallel debits can never overdraw a wallet', function () {
    $a = User::factory()->create();
    $b = User::factory()->create();
    fund($a, 1000);

    $results = race(array_map(fn ($i) => ['debit', ['from' => $a->id, 'to' => $b->id, 'amount' => 300]], range(1, 10)));

    expect(collect($results)->where('ok', true))->toHaveCount(3)
        ->and(collect($results)->where('error', 'insufficient_balance'))->toHaveCount(7)
        ->and(balance($a))->toBe(100)
        ->and(balance($b))->toBe(900)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('parallel requests with one idempotency key move money once', function () {
    $super = User::factory()->superAdmin()->create();
    $agent = User::factory()->agent()->create();

    $results = race(array_map(fn () => ['allocate', ['actor' => $super->id, 'recipient' => $agent->id, 'amount' => 50000, 'key' => 'same-key']], range(1, 6)));

    expect(collect($results)->where('ok', true))->toHaveCount(6)
        ->and(collect($results)->pluck('tx')->unique())->toHaveCount(1)
        ->and(WalletTransaction::query()->count())->toBe(1)
        ->and(WalletAllocation::query()->count())->toBe(1)
        ->and(balance($agent, Currency::VC, WalletType::Allocation))->toBe(50000);
});

test('eight simultaneous joins fill exactly two tables of four', function () {
    $room = GameRoom::factory()->create();
    $players = User::factory()->count(8)->create();
    $players->each(fn ($p) => fund($p, $room->entry_amount));

    $results = race($players->map(fn ($p) => ['join', ['user' => $p->id, 'room' => $room->id]])->values()->all());

    expect(collect($results)->where('ok', true))->toHaveCount(8);

    $byTable = GamePlayer::query()->get()->groupBy('game_table_id');
    expect($byTable)->toHaveCount(2);
    $byTable->each(fn ($seats) => expect($seats->pluck('seat')->sort()->values()->all())->toBe([1, 2, 3, 4]));

    expect(WalletHold::query()->count())->toBe(8)
        ->and(app(WalletService::class)->escrow(Currency::VC)->balance)->toBe($room->entry_amount * 8)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('one player joining five times at once gets one seat and pays once', function () {
    $room = GameRoom::factory()->create();
    $player = User::factory()->create();
    fund($player, $room->entry_amount * 10);

    $results = race(array_map(fn () => ['join', ['user' => $player->id, 'room' => $room->id]], range(1, 5)));

    expect(collect($results)->where('ok', true))->toHaveCount(5)
        ->and(GamePlayer::query()->where('user_id', $player->id)->count())->toBe(1)
        ->and(WalletHold::query()->where('user_id', $player->id)->count())->toBe(1)
        ->and(balance($player))->toBe($room->entry_amount * 9);
});

test('simultaneous final submissions and resolves settle the game exactly once', function () {
    $room = GameRoom::factory()->create();
    $players = User::factory()->count(4)->create();
    $tables = app(TableService::class);

    foreach ($players as $p) {
        fund($p, $room->entry_amount);
        $seat = $tables->join($p, $room);
    }

    foreach ($players as $p) {
        $tables->setReady($p, $seat->table, true);
    }

    $session = $seat->table->fresh()->currentSession;
    expect(GameCard::query()->where('game_session_id', $session->id)->count())->toBe(4);

    $jobs = $players->map(fn ($p) => ['submit', ['user' => $p->id, 'session' => $session->id]])->values()->all();
    $jobs = [...$jobs, ['resolve', ['session' => $session->id]], ['resolve', ['session' => $session->id]], ['resolve', ['session' => $session->id]]];
    race($jobs);

    // Whatever order the processes ran in, finish any remaining step once more.
    app(GameEngine::class)->resolve($session->fresh());

    $session->refresh();
    expect($session->status)->toBe(GameStatus::Completed)
        ->and(GameSettlement::query()->count())->toBe(1)
        ->and(GamePayout::query()->count())->toBe(4)
        ->and(WalletTransaction::query()->where('type', 'GAME_REWARD')->count())->toBeLessThanOrEqual(4)
        ->and(WalletTransaction::query()->where('type', 'PLATFORM_FEE')->count())->toBe(1)
        ->and($session->results()->sum('score'))->toBe(0)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('simultaneous bets against one banker never over-commit the banker cover', function () {
    $room = GameRoom::factory()->create([
        'game_mode' => 'round_bank', 'entry_amount' => 1_000, 'max_bet' => 5_000, 'min_players' => 2, 'platform_fee_bps' => 0,
    ]);
    $tables = app(TableService::class);
    $players = User::factory()->player()->count(4)->create();

    foreach ($players as $i => $p) {
        // Seat 1 banks round 1 with only 120.00: enough to cover one 50.00 bet (100.00) plus one 10.00 bet (20.00).
        fund($p, $i === 0 ? 12_000 : 100_000);
        $seat = $tables->join($p, $room);
    }

    foreach ($players as $p) {
        $tables->setReady($p, $seat->table->fresh(), true);
    }

    $session = $seat->table->fresh()->currentSession;
    $banker = User::findOrFail($session->banker_user_id);
    expect($banker->id)->toBe($players[0]->id);

    $jobs = collect($session->config['participants'])->map(fn ($id) => ['bet', ['user' => $id, 'session' => $session->id, 'amount' => 5_000]])->all();
    $results = race([...$jobs, ...$jobs]); // each player fires twice at once

    $bets = GameBet::query()->where('game_session_id', $session->id)->get();

    expect(collect($results)->where('ok', true))->toHaveCount(1)
        ->and($bets)->toHaveCount(1)
        ->and(balance($banker))->toBe(2_000)
        ->and((int) WalletHold::query()->where('game_session_id', $session->id)->sum('amount'))->toBe(20_000)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});
