<?php

use App\Models\GameInvitation;
use App\Models\GameRoom;
use App\Models\User;
use App\Services\Game\TableService;
use App\Support\Level;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

test('friend requests, accepting, online status and no balances', function () {
    $me = User::factory()->player()->create(['username' => 'alice']);
    $bob = User::factory()->player()->create(['username' => 'bob']);
    fund($bob, 50_000);

    $this->actingAs($me, 'sanctum')->postJson('/api/v1/friends', ['username' => 'alice'])->assertStatus(422);
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/friends', ['username' => 'nobody'])->assertStatus(404);
    $id = $this->actingAs($me, 'sanctum')->postJson('/api/v1/friends', ['username' => 'bob'])->assertCreated()->json('data.id');
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/friends', ['username' => 'bob'])->assertStatus(409);

    // Only the addressee can accept.
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/friends/{$id}/accept")->assertNotFound();
    $this->actingAs($bob, 'sanctum')->getJson('/api/v1/friends')->assertJsonPath('data.incoming.0.username', 'alice');
    $this->actingAs($bob, 'sanctum')->postJson("/api/v1/friends/{$id}/accept")->assertOk();

    $res = $this->actingAs($me, 'sanctum')->getJson('/api/v1/friends')->assertOk()
        ->assertJsonPath('data.friends.0.username', 'bob')
        ->assertJsonPath('data.friends.0.online', true) // bob made a request just now
        ->assertJsonPath('data.online_count', 1);

    expect(str_contains($res->getContent(), 'balance'))->toBeFalse();
});

test('adding someone who already asked you accepts their request', function () {
    $a = User::factory()->player()->create(['username' => 'a1']);
    $b = User::factory()->player()->create(['username' => 'b1']);

    $this->actingAs($a, 'sanctum')->postJson('/api/v1/friends', ['username' => 'b1'])->assertCreated();
    $this->actingAs($b, 'sanctum')->postJson('/api/v1/friends', ['username' => 'a1'])->assertCreated()->assertJsonPath('data.status', 'accepted');
});

test('inviting a friend to your table', function () {
    $a = User::factory()->player()->create(['username' => 'host1']);
    $b = User::factory()->player()->create(['username' => 'pal1']);
    $stranger = User::factory()->player()->create();
    $room = GameRoom::factory()->create();
    fund($a, 50_000);

    $this->actingAs($a, 'sanctum')->postJson("/api/v1/friends/{$b->id}/invite")->assertNotFound(); // not friends yet

    $id = $this->actingAs($a, 'sanctum')->postJson('/api/v1/friends', ['username' => 'pal1'])->json('data.id');
    $this->actingAs($b, 'sanctum')->postJson("/api/v1/friends/{$id}/accept");

    $this->actingAs($a, 'sanctum')->postJson("/api/v1/friends/{$b->id}/invite")->assertStatus(409); // not seated

    app(TableService::class)->join($a, $room);
    $this->actingAs($a, 'sanctum')->postJson("/api/v1/friends/{$b->id}/invite")->assertCreated();
    $this->actingAs($a, 'sanctum')->postJson("/api/v1/friends/{$stranger->id}/invite")->assertNotFound();

    expect(GameInvitation::query()->where('invitee_id', $b->id)->where('game_room_id', $room->id)->exists())->toBeTrue();
});

test('levels grow with xp', function () {
    expect(Level::fromXp(0)['level'])->toBe(1)
        ->and(Level::fromXp(99)['level'])->toBe(1)
        ->and(Level::fromXp(100)['level'])->toBe(2)
        ->and(Level::fromXp(299)['level'])->toBe(2)
        ->and(Level::fromXp(300)['level'])->toBe(3)
        ->and(Level::fromXp(350))->toBe(['level' => 3, 'xp' => 350, 'into_level' => 50, 'for_next' => 300]);
});
