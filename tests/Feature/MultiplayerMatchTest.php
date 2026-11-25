<?php

use App\Enums\Currency;
use App\Enums\TableStatus;
use App\Enums\TransactionType;
use App\Events\Game\TableEvent;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Models\User;
use App\Services\Game\BankerMatchService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/*
| Multiplayer lobby matches: chips 1:1 with the Minimum Entry, 12 rounds, clockwise banker rotation
| that skips players below the banker reserve (6 × the maximum bet). Uses the LobbyTest helpers
| (lbPlayer, lbCreate, lbFull, lbStart, lbPlayRound).
*/

/** Leave the player exactly `$chips` Chips (test only). */
function mmSetChips(User $u, int $chips): void
{
    $wallet = app(WalletService::class)->for($u, Currency::CH);
    $diff = $wallet->fresh()->balance - $chips * 100;
    if ($diff > 0) {
        app(LedgerService::class)->transfer(new TransferRequest(TransactionType::ManualAdjustment, Currency::CH, $wallet, null, $diff, 'test drain'));
    }
}

function mmCurrent(GameTable $table): GameSession
{
    return GameSession::query()->findOrFail($table->fresh()->current_session_id);
}

function mmNext($test, GameTable $table): void
{
    lbPlayRound($table);
    $test->travel(10)->seconds();
    app(BankerMatchService::class)->startRound($table->fresh());
}

test('Minimum Entry 100 → chips of exactly 5, 10 and 15 Chips (1:1); only those can be bet', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $this->actingAs($owner, 'sanctum')->getJson('/api/v1/lobbies')->assertJsonPath('data.0.bet_chips', ['5.00', '10.00', '15.00'])->assertJsonPath('data.0.min_bet', '5.00');

    $table = lbStart($this, [$owner, ...$others], $room);
    $this->actingAs($others[0], 'sanctum')->getJson("/api/v1/tables/{$table->id}")->assertOk()
        ->assertJsonPath('data.room.bet_chips', ['5.00', '10.00', '15.00'])
        ->assertJsonPath('data.room.min_entry', '100.00')
        ->assertJsonPath('data.room.max_bet', '15.00')
        ->assertJsonPath('data.room.banker_reserve', '90.00')
        ->assertJsonPath('data.rounds_total', 12);

    $session = mmCurrent($table);
    expect($session->round_number)->toBe(1)->and($session->config['bet_chips'])->toBe([500, 1_000, 1_500]);

    foreach (['7.00', '1500.00', '500.00', '20.00'] as $bad) {
        $this->actingAs($others[0], 'sanctum')->postJson("/api/v1/games/{$session->id}/bet", ['amount' => $bad])->assertStatus(422)->assertJsonPath('error', 'invalid_bet');
    }
    $this->actingAs($others[0], 'sanctum')->postJson("/api/v1/games/{$session->id}/bet", ['amount' => '15.00'])->assertSuccessful();
    $this->actingAs($others[0], 'sanctum')->postJson("/api/v1/games/{$session->id}/bet", ['amount' => '5.00'])->assertStatus(409);
    $this->actingAs($others[1], 'sanctum')->getJson("/api/v1/games/{$session->id}")->assertOk()
        ->assertJsonPath('data.config.bet_chips', ['5.00', '10.00', '15.00'])->assertJsonPath('data.config.banker_reserve', '90.00')->assertJsonPath('data.players.1.bet', '15.00');
});

test('the banker rotates clockwise; a player below 6 × the maximum bet is skipped, checked and recorded', function () {
    Event::fake([TableEvent::class]);
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100, 'game_mode' => 'round_bank']);
    [$b, $c, $d] = $others;
    $table = lbStart($this, [$owner, ...$others], $room);
    expect(mmCurrent($table)->banker_user_id)->toBe($owner->id); // seat 1, the creator

    // Seat 2 drops below the 90-Chip banker reserve (6 × 15): skipped, seat 3 banks.
    mmSetChips($b, 60);
    mmNext($this, $table);
    $s2 = mmCurrent($table);
    expect($s2->round_number)->toBe(2)->and($s2->banker_user_id)->toBe($c->id)
        ->and($s2->config['banker_selection']['reason'])->toBe('rotation_skipped_ineligible')
        ->and(collect($s2->config['banker_selection']['checks'])->map(fn ($x) => [$x['user_id'], $x['eligible']])->all())->toBe([[$b->id, false], [$c->id, true]])
        ->and($s2->config['banker_selection']['required'])->toBe(9_000)
        ->and(collect($s2->config['seat_order'])->pluck('user_id')->all())->toBe([$owner->id, $b->id, $c->id, $d->id])
        ->and($s2->config['participants'])->toContain($b->id); // still plays, just cannot bank

    Event::assertDispatched(TableEvent::class, fn (TableEvent $e) => $e->name === 'banker.assigned' && ($e->payload['skipped_user_ids'] ?? null) === [$b->id] && $e->payload['banker_user_id'] === $c->id);

    // Everyone sees the same banker and eligibility, never another player's balance.
    $state = $this->actingAs($d, 'sanctum')->getJson("/api/v1/games/{$s2->id}")->assertOk()->json('data');
    expect($state['banker_user_id'])->toBe($c->id)
        ->and($state['banker_selection']['checks'][0])->toBe(['user_id' => $b->id, 'seat' => 2, 'eligible' => false])
        ->and(json_encode($state['banker_selection']))->not->toContain('balance');

    // Next round continues clockwise from seat 3: seat 4.
    mmNext($this, $table);
    expect(mmCurrent($table)->banker_user_id)->toBe($d->id)->and(mmCurrent($table)->round_number)->toBe(3);
});

test('when nobody holds the banker reserve the match pauses (never an underfunded banker), resumes when someone qualifies', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $table = lbStart($this, [$owner, ...$others], $room);
    foreach ([$owner, ...$others] as $p) {
        mmSetChips($p, 40);
    }
    \Illuminate\Support\Facades\Event::fake([\App\Events\Game\TableEvent::class]);
    mmNext($this, $table);

    // Paused, not ended: no round 2, nobody named banker, a clear message in the game state.
    $t = $table->fresh();
    expect($t->status)->toBe(TableStatus::InGame)->and($t->paused_at)->not->toBeNull()->and($t->pause_reason)->toBe('no_eligible_banker')
        ->and(GameSession::query()->where('game_table_id', $table->id)->count())->toBe(1);
    \Illuminate\Support\Facades\Event::assertDispatched(\App\Events\Game\TableEvent::class, fn ($e) => $e->name === \App\Events\Game\GameEvents::MATCH_PAUSED);
    $state = $this->actingAs($others[0], 'sanctum')->getJson("/api/v1/tables/{$table->id}")->json('data');
    expect($state['table']['paused']['reason'] ?? $state['paused']['reason'] ?? null)->toBe('no_eligible_banker');

    // Retrying while nobody qualifies keeps it paused.
    $this->travel(20)->seconds();
    app(BankerMatchService::class)->startRound($table->fresh());
    expect($table->fresh()->paused_at)->not->toBeNull()->and(GameSession::query()->where('game_table_id', $table->id)->count())->toBe(1);

    // Seat 2 is loaded up to the 6× reserve (6 × 15 = 90 Chips): the next retry resumes with them as banker.
    fund($others[0], 10_000);
    $this->travel(20)->seconds();
    app(BankerMatchService::class)->startRound($table->fresh());
    $t = $table->fresh();
    expect($t->paused_at)->toBeNull()->and($t->status)->toBe(TableStatus::InGame)
        ->and(mmCurrent($table)->round_number)->toBe(2)->and(mmCurrent($table)->banker_user_id)->toBe($others[0]->id);
    \Illuminate\Support\Facades\Event::assertDispatched(\App\Events\Game\TableEvent::class, fn ($e) => $e->name === \App\Events\Game\GameEvents::MATCH_RESUMED);
});

test('a pause that lasts past the timeout ends the match', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $table = lbStart($this, [$owner, ...$others], $room);
    foreach ([$owner, ...$others] as $p) {
        mmSetChips($p, 40);
    }
    mmNext($this, $table);
    expect($table->fresh()->status)->toBe(TableStatus::InGame);

    $this->travel((int) config('pusoy.banker.pause_timeout_seconds') + 1)->seconds();
    app(BankerMatchService::class)->startRound($table->fresh());
    expect($table->fresh()->status)->toBe(TableStatus::Closed)->and($table->fresh()->end_reason)->toBe('no_eligible_banker');
});

test('a match is exactly 12 rounds, numbered 1 to 12, then it completes', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $table = lbStart($this, [$owner, ...$others], $room);

    $rounds = [];
    for ($i = 0; $i < 12; $i++) {
        $rounds[] = mmCurrent($table)->round_number;
        mmNext($this, $table);
    }

    expect($rounds)->toBe(range(1, 12))
        ->and($table->fresh()->rounds_played)->toBe(12)
        ->and($table->fresh()->status)->toBe(TableStatus::Closed)->and($table->fresh()->end_reason)->toBe('completed')
        ->and(GameSession::query()->where('game_table_id', $table->id)->count())->toBe(12);
    // A late startRound changes nothing.
    expect(app(BankerMatchService::class)->startRound($table->fresh()))->toBeNull();
});
