<?php

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

/*
 * Settings panel: game preferences saved on the account, and changing your password.
 */

test('game preferences default to BGM on, sound on, high motion and are saved on the account', function () {
    $me = User::factory()->player()->create();

    $this->actingAs($me, 'sanctum')->getJson('/api/v1/profile/preferences')->assertOk()
        ->assertExactJson(['data' => ['bgm' => true, 'sfx' => true, 'motion' => 'high']]);

    $this->actingAs($me, 'sanctum')->putJson('/api/v1/profile/preferences', ['bgm' => false, 'motion' => 'low'])->assertOk()
        ->assertExactJson(['data' => ['bgm' => false, 'sfx' => true, 'motion' => 'low']]);
    $this->actingAs($me, 'sanctum')->putJson('/api/v1/profile/preferences', ['sfx' => false])->assertOk()
        ->assertExactJson(['data' => ['bgm' => false, 'sfx' => false, 'motion' => 'low']]);

    // They come back with your account (e.g. after logging out and in again) and only on your own record.
    $this->actingAs($me->fresh(), 'sanctum')->getJson('/api/v1/auth/me')->assertOk()
        ->assertJsonPath('data.preferences', ['bgm' => false, 'sfx' => false, 'motion' => 'low']);

    $this->actingAs($me, 'sanctum')->putJson('/api/v1/profile/preferences', ['motion' => 'ultra'])->assertStatus(422);
    $this->actingAs($me, 'sanctum')->putJson('/api/v1/profile/preferences', ['bgm' => 'loud'])->assertStatus(422);
    $this->app['auth']->forgetGuards();
    $this->getJson('/api/v1/profile/preferences')->assertUnauthorized();
});

test('changing your password: current password checked, rules enforced, stored hashed, audited', function () {
    $me = User::factory()->player()->create(['password' => 'oldpass123']);
    $put = fn (array $body) => $this->actingAs($me, 'sanctum')->putJson('/api/v1/profile/password', $body);

    // Every field is required.
    $put([])->assertStatus(422)->assertJsonValidationErrors(['current_password', 'password']);
    // Wrong current password.
    $put(['current_password' => 'nope12345', 'password' => 'newpass123', 'password_confirmation' => 'newpass123'])
        ->assertStatus(422)->assertJsonPath('errors.current_password.0', 'Your current password is incorrect.');
    // Confirmation must match.
    $put(['current_password' => 'oldpass123', 'password' => 'newpass123', 'password_confirmation' => 'newpass124'])
        ->assertStatus(422)->assertJsonPath('errors.password.0', 'The new password and confirmation do not match.');
    // At least 8 characters with letters and numbers.
    $put(['current_password' => 'oldpass123', 'password' => 'short1', 'password_confirmation' => 'short1'])->assertStatus(422)->assertJsonValidationErrors('password');
    $put(['current_password' => 'oldpass123', 'password' => 'lettersonly', 'password_confirmation' => 'lettersonly'])->assertStatus(422)->assertJsonValidationErrors('password');
    // Must differ from the current one.
    $put(['current_password' => 'oldpass123', 'password' => 'oldpass123', 'password_confirmation' => 'oldpass123'])->assertStatus(422)->assertJsonValidationErrors('password');

    $put(['current_password' => 'oldpass123', 'password' => 'newpass123', 'password_confirmation' => 'newpass123'])->assertOk()
        ->assertJsonPath('message', 'Password updated.');

    $raw = (string) $me->fresh()->getAuthPassword();
    expect($raw)->not->toBe('newpass123')
        ->and(Hash::check('newpass123', $raw))->toBeTrue()
        ->and(Hash::check('oldpass123', $raw))->toBeFalse()
        ->and(AuditLog::query()->where('action', 'user.password_changed')->count())->toBe(1);
});
