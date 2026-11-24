<?php

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    config(['pusoy.features.player_login' => false]);
});

test('while player sign-in is off, players cannot sign in on the web or in the app', function () {
    $player = User::factory()->player()->create(['username' => 'shutout', 'password' => 'secret123']);

    $this->post('/login', ['username' => 'shutout', 'password' => 'secret123'])->assertSessionHasErrors('username');
    $this->assertGuest();

    $this->postJson('/api/v1/auth/login', ['username' => 'shutout', 'password' => 'secret123'])
        ->assertForbidden()->assertJsonPath('error', 'player_login_disabled');
    expect($player->tokens()->count())->toBe(0);

    // A wrong password still says only "wrong credentials" (nothing about the switch).
    $this->postJson('/api/v1/auth/login', ['username' => 'shutout', 'password' => 'nope'])->assertStatus(422);
});

test('players already signed in are refused too, and come back when the switch is on', function () {
    $player = User::factory()->player()->create();
    $token = $player->createToken('phone')->plainTextToken;

    $this->withToken($token)->getJson('/api/v1/wallet')->assertForbidden()->assertJsonPath('error', 'player_login_disabled');
    $this->actingAs($player)->get('/lobby')->assertRedirect('/');
    expect($player->tokens()->count())->toBe(1); // kept for when sign-in reopens

    config(['pusoy.features.player_login' => true]);
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/v1/wallet')->assertOk();
});

test('Admins and every agent level still sign in normally', function () {
    foreach ([superAdmin(), User::factory()->create(['role' => 'admin']), User::factory()->agent()->create()] as $i => $user) {
        $user->forceFill(['username' => "staff{$i}", 'password' => 'secret123'])->save();
        $this->postJson('/api/v1/auth/login', ['username' => "staff{$i}", 'password' => 'secret123'])->assertOk();
    }
});
