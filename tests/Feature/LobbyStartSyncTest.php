<?php

use App\Events\Game\GameBroadcast;
use App\Events\Game\TableEvent;
use App\Jobs\StartLobbyMatch;
use App\Models\GameTable;
use App\Services\Game\BankerMatchService;
use App\Services\Game\LobbyService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Broadcasting\BroadcastEvent;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

// The match starts on the server when the countdown ends, for everyone at once.

/** Owner + one guest seated and confirmed: [owner, room, guest]. */
function syncLobby($test): array
{
    $owner = lbPlayer();
    $room = lbCreate($test, $owner, ['min_entry' => 100])->assertCreated()->json('data');
    $test->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 1])->assertOk();
    $guest = lbPlayer();
    $test->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join")->assertCreated();
    $test->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/seat", ['seat' => 3])->assertOk();

    return [$owner, $room, $guest];
}

test('the countdown schedules the server-side start for the moment it ends', function () {
    Queue::fake([StartLobbyMatch::class]);
    [$owner, $room, $guest] = syncLobby($this);
    foreach ([$owner, $guest] as $p) {
        $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    }
    $table = GameTable::query()->findOrFail($room['table_id']);

    Queue::assertPushed(StartLobbyMatch::class, 1);
    Queue::assertPushed(StartLobbyMatch::class, fn ($job) => $job->tableId === $table->id
        && abs($job->delay->getTimestamp() - $table->countdown_ends_at->getTimestamp()) <= 1);
});

test('the job starts the match at 0 without any player asking, and only once', function () {
    [$owner, $room, $guest] = syncLobby($this);
    foreach ([$owner, $guest] as $p) {
        $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    }
    $table = GameTable::query()->findOrFail($room['table_id']);
    $job = new StartLobbyMatch($table->id);

    // Early (the queue ran it before 0): nothing starts yet.
    app()->call([$job->withFakeQueueInteractions(), 'handle']);
    expect($table->fresh()->status->value)->not->toBe('IN_GAME');

    // At 0: the server starts the match by itself — no lobby request from either phone.
    $this->travel(3100)->milliseconds();
    Event::fake([TableEvent::class]);
    app()->call([(new StartLobbyMatch($table->id))->withFakeQueueInteractions(), 'handle']);
    expect($table->fresh()->status->value)->toBe('IN_GAME')->and($table->fresh()->current_session_id)->not->toBeNull();
    Event::assertDispatched(TableEvent::class, fn ($e) => $e->broadcastAs() === 'match.started');

    // A second run (or a phone's lobby request at 0) does not start another one.
    $session = $table->fresh()->current_session_id;
    app()->call([(new StartLobbyMatch($table->id))->withFakeQueueInteractions(), 'handle']);
    app(LobbyService::class)->tick($table->fresh(), app(BankerMatchService::class));
    expect($table->fresh()->current_session_id)->toBe($session);
    expect(Event::dispatched(TableEvent::class, fn ($e) => $e->broadcastAs() === 'match.started'))->toHaveCount(1);
});

test('game events go to Reverb straight away, after the commit, never through the queue', function () {
    expect(is_subclass_of(TableEvent::class, GameBroadcast::class))->toBeTrue()
        ->and(new TableEvent(1, 'x', []))->toBeInstanceOf(ShouldBroadcastNow::class)
        ->toBeInstanceOf(ShouldDispatchAfterCommit::class)
        ->toBeInstanceOf(ShouldRescue::class);

    Queue::fake();
    [$owner, $room, $guest] = syncLobby($this);
    foreach ([$owner, $guest] as $p) {
        $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    }
    // (Other events, like the admin panel's, may still be queued.)
    Queue::assertNotPushed(BroadcastEvent::class, fn ($job) => $job->event instanceof GameBroadcast);
});
