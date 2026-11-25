<?php

use App\Enums\GameStatus;
use App\Events\Game\TableEvent;
use App\Game\AutoArranger;
use App\Models\GameBet;
use App\Models\GameCard;
use App\Models\GameSession;
use App\Models\GameSubmission;
use App\Models\GameTable;
use App\Models\User;
use App\Notifications\RemovedFromMatch;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use App\Services\Game\TableService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/*
| Disconnection, timer expiry, saved arrangements and reconnection in multiplayer lobby matches.
| Lobby helpers (lbFull, lbStart, lbPlayRound) live in tests/Pest.php.
*/

/** Everyone in the round bets the smallest chip → the cards are dealt. */
function rcDeal(GameTable $table): GameSession
{
    $session = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    foreach ($session->config['participants'] as $uid) {
        if (! GameBet::query()->where('game_session_id', $session->id)->where('user_id', $uid)->exists()) {
            app(BankerMatchService::class)->placeBet(User::find($uid), $session->fresh(), $session->config['min_bet']);
        }
    }

    return $session->fresh();
}

/** A valid arrangement of the player's cards (the server's own non-fouling one), as plain rows. */
function rcRows(GameSession $s, User $u): array
{
    $a = AutoArranger::arrange(GameCard::query()->where('game_session_id', $s->id)->where('user_id', $u->id)->value('cards'));

    return ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back];
}

function rcSorted(array $rows): array
{
    return array_map(function ($lane) {
        sort($lane);

        return $lane;
    }, $rows);
}

function rcStart($test): array
{
    [$owner, $room, $others] = lbFull($test, ['min_entry' => 100]);
    $table = lbStart($test, [$owner, ...$others], $room);

    return [$table, [$owner, ...$others]];
}

test('timer expiry submits the player\'s last saved arrangement — not a reset or random one — once', function () {
    Event::fake([TableEvent::class]);
    [$table, $players] = rcStart($this);
    $s = rcDeal($table);
    expect($s->status)->toBe(GameStatus::Arranging);
    $me = User::find($s->config['participants'][0]);

    // Arranging: the app saves each valid arrangement. A later invalid or misplaced one keeps the last valid.
    $rows = rcRows($s, $me);
    $rows['front'] = array_reverse($rows['front']); // the player's own card order inside a lane
    $this->actingAs($me, 'sanctum')->putJson("/api/v1/games/{$s->id}/draft", $rows)->assertOk()->assertJsonPath('data.saved', true);
    // Not your 13 cards (one repeated, one missing): kept out.
    $this->actingAs($me, 'sanctum')->putJson("/api/v1/games/{$s->id}/draft", ['front' => [$rows['middle'][0], $rows['front'][1], $rows['front'][2]], 'middle' => $rows['middle'], 'back' => $rows['back']])->assertOk()->assertJsonPath('data.saved', false);
    $this->actingAs($me, 'sanctum')->putJson("/api/v1/games/{$s->id}/draft", ['front' => ['AS', 'KS', 'QS'], 'middle' => $rows['middle'], 'back' => $rows['back']])->assertOk()->assertJsonPath('data.saved', false);

    // Coming back restores it.
    $this->actingAs($me, 'sanctum')->getJson("/api/v1/games/{$s->id}")->assertJsonPath('data.my_draft.front', $rows['front']);

    // Time runs out (twice — the job may run again): one submission each, mine is exactly my saved one.
    $this->travel(120)->seconds();
    app(GameEngine::class)->expire($s->fresh());
    app(GameEngine::class)->expire($s->fresh());

    $mine = GameSubmission::query()->where('game_session_id', $s->id)->where('user_id', $me->id)->sole();
    expect([$mine->front, $mine->middle, $mine->back])->toBe([$rows['front'], $rows['middle'], $rows['back']])
        ->and($mine->is_auto)->toBeTrue()->and($mine->is_foul)->toBeFalse()
        ->and(GameSubmission::query()->where('game_session_id', $s->id)->count())->toBe(GameCard::query()->where('game_session_id', $s->id)->count());
    Event::assertDispatched(TableEvent::class, fn (TableEvent $e) => $e->name === 'player.submitted' && $e->payload['user_id'] === $me->id && ($e->payload['source'] ?? null) === 'saved_arrangement');

    // Locked: no draft changes, no second submission.
    $this->actingAs($me, 'sanctum')->putJson("/api/v1/games/{$s->id}/draft", $rows)->assertStatus(409);
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/games/{$s->id}/submit", $rows)->assertStatus(409);
    expect(GameSubmission::query()->where('game_session_id', $s->id)->where('user_id', $me->id)->count())->toBe(1);
});

test('without a saved arrangement the cards are submitted as dealt; only the dealt player can save one', function () {
    Event::fake([TableEvent::class]);
    [$table, $players] = rcStart($this);
    $s = rcDeal($table);
    $me = User::find($s->config['participants'][0]);
    $outsider = lbPlayer();
    $this->actingAs($outsider, 'sanctum')->putJson("/api/v1/games/{$s->id}/draft", rcRows($s, $me))->assertForbidden();

    $this->travel(120)->seconds();
    app(GameEngine::class)->expire($s->fresh());

    $sub = GameSubmission::query()->where('game_session_id', $s->id)->where('user_id', $me->id)->sole();
    $cards = \App\Models\GameCard::query()->where('game_session_id', $s->id)->where('user_id', $me->id)->first()->cards;
    expect($sub->is_auto)->toBeTrue()->and($sub->front)->toBe(array_slice($cards, 0, 3))->and($sub->back)->toBe(array_slice($cards, 8, 5));
    Event::assertDispatched(TableEvent::class, fn (TableEvent $e) => $e->name === 'player.submitted' && $e->payload['user_id'] === $me->id && $e->payload['source'] === 'as_dealt');
});

test('a player who drops out mid-round does not hold up the table; their saved hand is played and they resume next round', function () {
    [$table, $players] = rcStart($this);
    $s = rcDeal($table);
    $gone = User::find($s->config['participants'][1]);
    $rows = rcRows($s, $gone);
    $this->actingAs($gone, 'sanctum')->putJson("/api/v1/games/{$s->id}/draft", $rows)->assertOk();

    // Gone: no heartbeat for longer than the disconnect window.
    $this->travel((int) config('pusoy.game.disconnect_after_seconds') + 5)->seconds();
    foreach ($players as $p) {
        if ($p->id !== $gone->id) {
            app(TableService::class)->heartbeat($p, $table); // the others are still here
        }
    }
    app(TableService::class)->sweep();
    expect($table->players()->where('user_id', $gone->id)->value('is_connected'))->toBeFalse();

    // The others submit; the timer ends; the round completes and settles without them.
    foreach (GameCard::query()->where('game_session_id', $s->id)->where('user_id', '!=', $gone->id)->get() as $card) {
        $a = AutoArranger::arrange($card->cards);
        GameSubmission::query()->where('game_session_id', $s->id)->where('user_id', $card->user_id)->exists()
            || app(GameEngine::class)->submit(User::find($card->user_id), $s->fresh(), $a->front, $a->middle, $a->back);
    }
    $this->travel(120)->seconds();
    app(GameEngine::class)->expire($s->fresh());
    app(GameEngine::class)->resolve($s->fresh());
    expect($s->fresh()->status)->toBe(GameStatus::Completed)
        ->and(rcSorted(GameSubmission::query()->where('game_session_id', $s->id)->where('user_id', $gone->id)->sole()->only(['front', 'middle', 'back'])))->toBe(rcSorted($rows));

    // Still offline at the next round: they sit it out (round 1 is never replayed).
    $this->travel(10)->seconds();
    app(BankerMatchService::class)->startRound($table->fresh());
    $s2 = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    expect($s2->round_number)->toBe(2)->and($s2->config['participants'])->not->toContain($gone->id);

    // They come back: same match, same seat, current round state; they are dealt in from round 3.
    $this->actingAs($gone, 'sanctum')->postJson("/api/v1/tables/{$table->id}/heartbeat")->assertOk();
    $this->actingAs($gone, 'sanctum')->getJson('/api/v1/tables/current')->assertJsonPath('data.id', $table->id)->assertJsonPath('data.status', 'IN_GAME');
    $this->actingAs($gone, 'sanctum')->getJson("/api/v1/games/{$s2->id}")->assertOk()->assertJsonPath('data.round_number', 2)->assertJsonPath('data.my_cards', null);
    lbPlayRound($table);
    $this->travel(10)->seconds();
    app(BankerMatchService::class)->startRound($table->fresh());
    $s3 = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    expect($s3->round_number)->toBe(3)
        ->and(array_merge([$s3->banker_user_id], $s3->config['participants']))->toContain($gone->id)
        ->and(GameSession::query()->where('game_table_id', $table->id)->pluck('round_number')->all())->toBe([1, 2, 3]);
});

test('a player who stays offline is removed after missing rounds, told, and sent back to the lobby', function () {
    [$table, $players] = rcStart($this);
    lbPlayRound($table);
    $s1 = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    $this->travel(10)->seconds();

    $gone = $players[2];
    $table->players()->where('user_id', $gone->id)->update(['is_connected' => false]);

    foreach ([2, 3] as $round) {
        app(BankerMatchService::class)->startRound($table->fresh());
        lbPlayRound($table);
        $this->travel(10)->seconds();
    }
    app(BankerMatchService::class)->startRound($table->fresh());

    expect($table->players()->where('user_id', $gone->id)->exists())->toBeFalse()
        ->and($table->fresh()->status->value)->toBe('IN_GAME'); // the others play on
    expect($gone->notifications()->where('type', RemovedFromMatch::class)->exists())->toBeTrue();

    // Back online: no seat any more → the app goes to the lobby; their finished round is still settled.
    $this->actingAs($gone, 'sanctum')->getJson('/api/v1/tables/current')->assertJsonPath('data', null);
    $this->actingAs($gone, 'sanctum')->getJson("/api/v1/tables/{$table->id}")->assertForbidden();
    expect(GameSession::query()->find($s1->id)->status)->toBe(GameStatus::Completed);
});
