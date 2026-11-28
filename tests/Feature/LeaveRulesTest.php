<?php

use App\Models\GameBet;
use App\Models\GamePlayer;
use App\Models\GameSession;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Game\BankerMatchService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

// Leave Game only in the Betting Phase (BankerMatchService::leaveBlock / assertCanLeave).

const LEAVE_BLOCKED_MSG = 'You cannot leave the game once the betting phase has ended. Please wait until the round is complete.';

/** A started four-player lobby match, in its first Betting Phase: [table, session, banker, non-bankers]. */
function lrMatch($test): array
{
    [$owner, $room, $others] = lbFull($test, ['min_entry' => 100]);
    $players = [$owner, ...$others];
    $table = lbStart($test, $players, $room);
    $session = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    $banker = User::find($session->banker_user_id);

    return [$table, $session, $banker, collect($players)->reject(fn ($u) => $u->id === $banker->id)->values()->all()];
}

test('Betting Phase, nothing at stake: Leave is enabled and works; the leaver is not auto-bet or dealt in', function () {
    [$table, $session, , [$a, $b, $c]] = lrMatch($this);
    expect($session->status->value)->toBe('BETTING');
    $before = WalletTransaction::query()->count();

    $this->actingAs($a, 'sanctum')->getJson("/api/v1/tables/{$table->id}")->assertOk()
        ->assertJsonPath('data.leave.allowed', true)->assertJsonPath('data.leave.reason', null);
    $this->actingAs($a, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertOk();
    expect(GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $a->id)->exists())->toBeFalse()
        ->and(WalletTransaction::query()->count())->toBe($before);

    // Double exit: nothing more happens.
    $this->actingAs($a, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertNotFound();

    // The others bet; betting closes; the leaver is neither auto-bet nor dealt.
    foreach ([$b, $c] as $u) {
        app(BankerMatchService::class)->placeBet($u, $session->fresh(), $session->config['min_bet']);
    }
    app(BankerMatchService::class)->closeBetting($session->fresh(), true);
    expect($session->fresh()->status->value)->toBe('ARRANGING')
        ->and(GameBet::query()->where('game_session_id', $session->id)->where('user_id', $a->id)->exists())->toBeFalse()
        ->and(\App\Models\GameCard::query()->where('game_session_id', $session->id)->where('user_id', $a->id)->exists())->toBeFalse()
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('after the Betting Phase: every leave is refused with the message, the seat and the round untouched', function () {
    [$table, $session, $banker, [$a, $b, $c]] = lrMatch($this);
    foreach ([$a, $b] as $u) {
        app(BankerMatchService::class)->placeBet($u, $session->fresh(), $session->config['min_bet']);
    }
    app(BankerMatchService::class)->closeBetting($session->fresh(), true);
    expect($session->fresh()->status->value)->toBe('ARRANGING');

    // Even $c, who sat this round out, waits for the round to finish.
    foreach ([$a, $c, $banker] as $u) {
        $this->actingAs($u, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertStatus(409)
            ->assertJsonPath('error', 'leave_not_allowed')->assertJsonPath('message', LEAVE_BLOCKED_MSG);
        expect(GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $u->id)->exists())->toBeTrue();
    }
    $this->actingAs($c, 'sanctum')->getJson("/api/v1/tables/{$table->id}")
        ->assertJsonPath('data.leave.allowed', false)->assertJsonPath('data.leave.reason', LEAVE_BLOCKED_MSG);
    expect($session->fresh()->status->value)->toBe('ARRANGING');
});

test('Betting Phase but Chips at stake (a bet placed, or the banker covering one): stays for the round, no refund', function () {
    [$table, $session, $banker, [$a]] = lrMatch($this);
    app(BankerMatchService::class)->placeBet($a, $session->fresh(), $session->config['min_bet']);
    $before = WalletTransaction::query()->count();

    $this->actingAs($a, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertStatus(409)->assertJsonPath('message', 'You have placed a bet this round. You can leave once the round is complete.');
    $this->actingAs($banker, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertStatus(409)->assertJsonPath('error', 'leave_not_allowed');
    expect(WalletTransaction::query()->count())->toBe($before)
        ->and(GameBet::query()->where('game_session_id', $session->id)->count())->toBe(1);
});

test('a stale Betting Phase (deadline passed, not yet closed) is already over', function () {
    [$table, $session, , [$a]] = lrMatch($this);
    $this->travelTo($session->betting_deadline->addSecond());
    $session->refresh();
    expect($session->status->value)->toBe('BETTING');
    // The request itself (not the clock tick) must refuse: call the service directly.
    expect(fn () => app(\App\Services\Game\TableService::class)->leave($a, $table->fresh()))->toThrow(\App\Exceptions\BusinessRuleException::class, 'betting phase has ended');
});

test('the banker may leave in Betting before any bet: that round is void (nothing held) and a new round starts', function () {
    [$table, $session, $banker] = lrMatch($this);
    $before = WalletTransaction::query()->count();

    $this->actingAs($banker, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertOk();

    expect($session->fresh()->status->value)->toBe('CANCELLED')->and($session->fresh()->cancel_reason)->toBe('banker_left');
    $next = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    expect($next->id)->not->toBe($session->id)
        ->and($next->status->value)->toBe('BETTING')
        ->and($next->banker_user_id)->not->toBe($banker->id)
        ->and($table->fresh()->rounds_played)->toBe(0)
        ->and(WalletTransaction::query()->count())->toBe($before)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('closing the app or refreshing mid-round is not a way out: the player stays seated, the round finishes, Leave returns in the next Betting Phase', function () {
    [$table, $session, $banker, [$a, $b, $c]] = lrMatch($this);
    $match = app(BankerMatchService::class);
    foreach ([$a, $b, $c] as $u) {
        $match->placeBet($u, $session->fresh(), $session->config['min_bet']);
    }
    $match->closeBetting($session->fresh(), true);
    expect($session->fresh()->status->value)->toBe('ARRANGING');

    // $a closes the app: no more heartbeats; the sweep marks them disconnected — still seated.
    $this->travel((int) config('pusoy.game.disconnect_after_seconds') + 5)->seconds();
    app(\App\Services\Game\TableService::class)->sweep();
    $seat = GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $a->id)->first();
    expect($seat)->not->toBeNull()->and($seat->is_connected)->toBeFalse();

    // A refresh (or a scripted request) trying to leave is refused the same way.
    $this->actingAs($a, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertStatus(409)
        ->assertJsonPath('error', 'leave_not_allowed');

    // Everyone else submits; the arrangement timer runs out; $a's hand is played for them.
    foreach ([$b, $c, $banker] as $u) {
        $cards = \App\Models\GameCard::query()->where('game_session_id', $session->id)->where('user_id', $u->id)->first();
        $arr = \App\Game\AutoArranger::arrange($cards->cards);
        app(\App\Services\Game\GameEngine::class)->submit($u, $session->fresh(), $arr->front, $arr->middle, $arr->back);
    }
    $this->travel(5)->minutes();
    app(\App\Services\Game\GameEngine::class)->expire($session->fresh());
    expect($session->fresh()->status->value)->toBe('COMPLETED')
        ->and(\App\Models\GameResult::query()->where('game_session_id', $session->id)->where('user_id', $a->id)->exists())->toBeTrue()
        ->and(GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $a->id)->exists())->toBeTrue()
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();

    // Results / the pause before the next round: still no way out.
    $this->actingAs($a, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertStatus(409);

    // $a comes back for the next round's Betting Phase: Leave is enabled again and works.
    foreach ([$a, $b, $c, $banker] as $u) {
        $this->actingAs($u, 'sanctum')->postJson("/api/v1/tables/{$table->id}/heartbeat")->assertOk();
    }
    $this->travel(10)->seconds();
    $match->startRound($table->fresh()); // no-op if the next round already started
    $next = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    expect($next->round_number)->toBe(2)->and($next->status->value)->toBe('BETTING');
    $this->actingAs($a, 'sanctum')->getJson("/api/v1/tables/{$table->id}")->assertJsonPath('data.leave.allowed', true);
    $this->actingAs($a, 'sanctum')->postJson("/api/v1/tables/{$table->id}/leave")->assertOk();
    expect(GamePlayer::query()->where('game_table_id', $table->id)->where('user_id', $a->id)->exists())->toBeFalse();
});
