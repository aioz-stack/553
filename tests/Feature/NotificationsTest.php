<?php

use App\Enums\MaintenanceMode;
use App\Models\GameInvitation;
use App\Models\GameRoom;
use App\Models\SystemSetting;
use App\Models\User;
use App\Notifications\ChipsWithdrawn;
use App\Notifications\RemovedFromLobby;
use App\Services\System\MaintenanceService;
use App\Services\Wallet\ChipLoadService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

function ntPlayer(int $chips = 10_000): User
{
    $u = User::factory()->player()->create();
    fund($u, $chips * 100);

    return $u;
}

function ntAdd(User $u, string $title, string $at, string $type = 'App\\Notifications\\PointsReceived'): string
{
    $id = (string) Str::uuid();
    $u->notifications()->create(['id' => $id, 'type' => $type, 'data' => ['title' => $title, 'message' => $title], 'created_at' => $at, 'updated_at' => $at]);

    return $id;
}

test('the feed is newest first; one notification is marked read (owner only) and the unread count follows; Mark All clears the rest', function () {
    $me = ntPlayer();
    $me->notifications()->delete(); // funding the test wallet sends its own "Points received"
    $old = ntAdd($me, 'Old', '2026-11-20 10:00:00');
    $new = ntAdd($me, 'New', '2026-11-24 10:00:00');
    $other = ntAdd(ntPlayer(), 'Not yours', '2026-11-24 11:00:00');

    $this->actingAs($me, 'sanctum')->getJson('/api/v1/notifications')->assertOk()
        ->assertJsonPath('data.0.id', $new)->assertJsonPath('data.1.id', $old)->assertJsonCount(2, 'data')->assertJsonPath('meta.unread', 2);

    $this->actingAs($me, 'sanctum')->postJson("/api/v1/notifications/{$new}/read")->assertOk()->assertJsonPath('meta.unread', 1);
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/notifications/{$other}/read")->assertNotFound();
    expect(User::query()->whereHas('notifications', fn ($q) => $q->whereKey($other)->whereNull('read_at'))->exists())->toBeTrue();

    $this->actingAs($me, 'sanctum')->postJson('/api/v1/notifications/read')->assertOk();
    $this->actingAs($me, 'sanctum')->getJson('/api/v1/notifications')->assertJsonPath('meta.unread', 0);
});

test('system and maintenance announcements are pinned in the feed while they apply', function () {
    $me = ntPlayer();
    $this->actingAs($me, 'sanctum')->getJson('/api/v1/notifications')->assertJsonPath('meta.announcement', null)->assertJsonPath('meta.maintenance', null);

    SystemSetting::query()->updateOrCreate(['key' => 'lobby_announcement'], ['value' => 'Tournament this Friday!']);
    app(MaintenanceService::class)->set(superAdmin(), MaintenanceMode::AgentsPlayers);

    $this->actingAs($me, 'sanctum')->getJson('/api/v1/notifications')
        ->assertJsonPath('meta.announcement', 'Tournament this Friday!')
        ->assertJsonPath('meta.maintenance.game_blocked', false)
        ->assertJsonPath('meta.maintenance.transactions_blocked', true)
        ->assertJsonPath('meta.maintenance.label', MaintenanceMode::AgentsPlayers->label());
});

test('lobby and account updates arrive as notifications: removed from a lobby, Chips withdrawn', function () {
    $owner = ntPlayer();
    $guest = ntPlayer();
    $id = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/lobbies', ['name' => 'Kick Test', 'game_mode' => 'round_bank', 'min_entry' => 1000, 'preparation_seconds' => 45])->assertCreated()->json('data.id');
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/lobbies/{$id}/join")->assertCreated();
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$id}/kick", ['user_id' => $guest->id])->assertOk();

    app(ChipLoadService::class)->withdraw(superAdmin(), $guest, 2500);

    $feed = $this->actingAs($guest, 'sanctum')->getJson('/api/v1/notifications')->assertOk()->json('data');
    $types = collect($feed)->pluck('type');
    expect($types)->toContain(RemovedFromLobby::class, ChipsWithdrawn::class);
    $removed = collect($feed)->firstWhere('type', RemovedFromLobby::class);
    expect($removed['data']['room_id'])->toBe($id)->and($removed['data']['message'])->toContain('Kick Test');
    expect(collect($feed)->firstWhere('type', ChipsWithdrawn::class)['data']['message'])->toContain('25.00 Chips');
});

test('a lobby invitation lets the invitee into a private lobby without the password (once); others still need it', function () {
    $owner = ntPlayer();
    $id = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/lobbies', ['name' => 'Secret', 'game_mode' => 'round_bank', 'min_entry' => 1000, 'preparation_seconds' => 45, 'password' => 'tiger553'])->assertCreated()->json('data.id');
    $friend = ntPlayer();
    $stranger = ntPlayer();
    $invite = GameInvitation::query()->create(['game_room_id' => $id, 'inviter_id' => $owner->id, 'invitee_id' => $friend->id, 'status' => 'pending', 'expires_at' => now()->addDay()]);

    $this->actingAs($stranger, 'sanctum')->postJson("/api/v1/lobbies/{$id}/join")->assertStatus(422)->assertJsonPath('error', 'wrong_password');
    $this->actingAs($friend, 'sanctum')->postJson("/api/v1/lobbies/{$id}/join")->assertCreated()->assertJsonPath('data.players', 2);
    expect($invite->fresh()->status)->toBe('accepted');

    // Expired invitations do not open the door.
    $late = ntPlayer();
    GameInvitation::query()->create(['game_room_id' => $id, 'inviter_id' => $owner->id, 'invitee_id' => $late->id, 'status' => 'pending', 'expires_at' => now()->subMinute()]);
    $this->actingAs($late, 'sanctum')->postJson("/api/v1/lobbies/{$id}/join")->assertStatus(422);
    expect(GameRoom::query()->find($id))->not->toBeNull();
});
