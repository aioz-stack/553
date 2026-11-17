<?php

use App\Enums\Ability;
use App\Enums\Role;
use App\Exceptions\BusinessRuleException;
use App\Models\User;
use App\Services\Users\UserManagementService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Broadcasting\Broadcasters\Broadcaster;
use Illuminate\Broadcasting\BroadcastManager;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
});

function newUserPayload(array $extra = []): array
{
    return [
        'name' => 'New Person',
        'username' => 'u'.uniqid(),
        'email' => uniqid().'@example.test',
        'password' => 'password123',
    ] + $extra;
}

test('unauthenticated API access is refused', function () {
    $this->getJson('/api/v1/wallet')->assertUnauthorized();
    $this->getJson('/api/v1/admin/users')->assertUnauthorized();
    $this->postJson('/api/v1/wallet/allocate')->assertUnauthorized();
});

test('super admin has every permission and is the only one who can create super admins', function () {
    $super = superAdmin();
    $admin = User::factory()->administrator()->create();
    app(UserManagementService::class)->syncPermissions($super, $admin, array_map(fn ($a) => $a->value, Ability::cases()));

    $this->actingAs($super)->postJson('/api/v1/admin/users', newUserPayload(['role' => 'super_admin']))->assertCreated();
    $this->actingAs($admin->fresh())->postJson('/api/v1/admin/users', newUserPayload(['role' => 'super_admin']))->assertForbidden();
    $this->actingAs($admin->fresh())->postJson('/api/v1/admin/administrators', newUserPayload())->assertForbidden();
});

test('administrators are limited to their configured permissions', function () {
    $super = superAdmin();
    $admin = User::factory()->administrator()->create();

    $this->actingAs($admin)->getJson('/api/v1/admin/players')->assertForbidden();
    $this->actingAs($admin)->getJson('/api/v1/admin/transactions')->assertForbidden();

    app(UserManagementService::class)->syncPermissions($super, $admin, [Ability::ManagePlayers->value]);

    $this->actingAs($admin->fresh())->getJson('/api/v1/admin/players')->assertOk();
    $this->actingAs($admin->fresh())->getJson('/api/v1/admin/agents')->assertForbidden();
    $this->actingAs($admin->fresh())->getJson('/api/v1/admin/transactions')->assertForbidden();
});

test('agents only see their own players', function () {
    $agentA = User::factory()->agent()->create();
    $agentB = User::factory()->agent()->create();
    $mine = app(UserManagementService::class)->create($agentA, Role::Player, newUserPayload());
    $theirs = app(UserManagementService::class)->create($agentB, Role::Player, newUserPayload());

    $this->actingAs($agentA)->getJson('/api/v1/agent/players')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $mine->id);

    $this->actingAs($agentA)->getJson("/api/v1/agent/players/{$theirs->id}")->assertForbidden();
    $this->actingAs($agentA)->getJson("/api/v1/agent/players/{$mine->id}")->assertOk();
});

test('agents can register players but never agents or administrators', function () {
    $agent = User::factory()->agent()->create();

    $this->actingAs($agent)->postJson('/api/v1/agent/players', newUserPayload())->assertCreated();
    $this->actingAs($agent)->postJson('/api/v1/admin/agents', newUserPayload())->assertForbidden();

    expect(fn () => app(UserManagementService::class)->create($agent, Role::Agent, newUserPayload()))->toThrow(BusinessRuleException::class);
    expect(fn () => app(UserManagementService::class)->create($agent, Role::Administrator, newUserPayload()))->toThrow(BusinessRuleException::class);
});

test('agents cannot allocate to another agent player through the API', function () {
    $agentA = User::factory()->agent()->create();
    $agentB = User::factory()->agent()->create();
    fund($agentA, 10_000);
    $theirs = app(UserManagementService::class)->create($agentB, Role::Player, newUserPayload());

    $this->actingAs($agentA)->postJson('/api/v1/wallet/allocate', [
        'recipient_id' => $theirs->id, 'currency' => 'VC', 'amount' => '10',
    ])->assertForbidden();
});

test('players cannot use admin, agent or allocation endpoints', function () {
    $player = User::factory()->create();

    $this->actingAs($player)->getJson('/api/v1/admin/users')->assertForbidden();
    $this->actingAs($player)->getJson('/api/v1/agent/dashboard')->assertForbidden();
    $this->actingAs($player)->postJson('/api/v1/wallet/allocate', ['recipient_id' => $player->id, 'currency' => 'VC', 'amount' => '100'])->assertForbidden();
});

test('cash deposits and withdrawals are disabled', function () {
    $player = User::factory()->create();

    $this->actingAs($player)->postJson('/api/v1/wallet/deposit')->assertForbidden()->assertJsonPath('error', 'feature_disabled');
    $this->actingAs($player)->postJson('/api/v1/wallet/withdraw')->assertForbidden();
});

test('suspended accounts are refused', function () {
    $player = User::factory()->suspended()->create();

    $this->actingAs($player)->getJson('/api/v1/wallet')->assertForbidden();
});

test('channel authorization callbacks enforce seat ownership', function () {
    [$table, , $players] = startGame();
    $stranger = User::factory()->create();

    $channels = (new ReflectionProperty(Broadcaster::class, 'channels'));
    $registered = $channels->getValue(app(BroadcastManager::class)->connection());

    expect($registered['table.{tableId}']($players[0], $table->id))->toBeArray()
        ->and($registered['table.{tableId}']($stranger, $table->id))->toBeFalse()
        ->and($registered['user.{id}']($players[0], $players[0]->id))->toBeTrue()
        ->and($registered['user.{id}']($stranger, $players[0]->id))->toBeFalse();
});
