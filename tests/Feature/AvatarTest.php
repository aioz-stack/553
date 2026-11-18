<?php

use App\Events\Game\TableEvent;
use App\Models\User;
use App\Support\Avatars;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

test('the catalogue has 9 boys, 10 girls and 10 animals with stable ids', function () {
    $ids = Avatars::ids();
    expect($ids)->toHaveCount(29)
        ->and(array_slice($ids, 0, 2))->toBe(['boy-01', 'boy-02'])
        ->and($ids)->toContain('girl-10', 'animal-10')
        ->and(array_unique($ids))->toHaveCount(29);
    // Everyone always has a valid avatar, even before choosing one.
    expect(Avatars::valid(Avatars::for(null, 12345)))->toBeTrue()
        ->and(Avatars::for('nope', 7))->toBe(Avatars::for(null, 7))
        ->and(Avatars::for('girl-03', 7))->toBe('girl-03');
});

test('a player chooses an avatar; it is saved, validated and shown on their profile', function () {
    $me = User::factory()->player()->create();
    $this->actingAs($me, 'sanctum')->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.avatar', Avatars::for(null, $me->id));

    $this->actingAs($me, 'sanctum')->putJson('/api/v1/profile/avatar', ['avatar' => 'animal-08'])->assertOk()->assertJsonPath('data.avatar', 'animal-08');
    expect($me->fresh()->avatar)->toBe('animal-08');
    $this->actingAs($me, 'sanctum')->getJson('/api/v1/auth/me')->assertJsonPath('data.avatar', 'animal-08');

    $this->actingAs($me, 'sanctum')->putJson('/api/v1/profile/avatar', ['avatar' => 'dragon-01'])->assertStatus(422)->assertJsonValidationErrors('avatar');
    $this->actingAs($me, 'sanctum')->putJson('/api/v1/profile/avatar', [])->assertStatus(422);
    expect($me->fresh()->avatar)->toBe('animal-08');
});

test('other players see the avatar in lobbies, and a seated player\'s table is told to refresh', function () {
    $owner = User::factory()->player()->create();
    fund($owner, 1_000_000);
    $room = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/lobbies', ['name' => 'Avatars', 'game_mode' => 'round_bank', 'min_entry' => 100, 'preparation_seconds' => 45])->assertCreated()->json('data');
    $guest = User::factory()->player()->create();
    fund($guest, 1_000_000);
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/join")->assertCreated();

    Event::fake([TableEvent::class]);
    $this->actingAs($owner, 'sanctum')->putJson('/api/v1/profile/avatar', ['avatar' => 'girl-05'])->assertOk();
    Event::assertDispatched(TableEvent::class, fn (TableEvent $e) => $e->name === 'player.updated' && $e->payload['avatar'] === 'girl-05');

    $this->actingAs($guest, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertJsonPath('data.seats.0.avatar', 'girl-05');
    $this->actingAs($guest, 'sanctum')->getJson("/api/v1/tables/{$room['table_id']}")->assertOk();
});
