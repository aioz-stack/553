<?php

use App\Game\AutoArranger;
use App\Game\Deck;
use App\Models\PracticeGame;
use App\Models\User;
use App\Models\WalletTransaction;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

test('single player practice deals 13 private cards and hides the bots until submit', function () {
    $me = User::factory()->player()->create();

    $res = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice')->assertCreated()
        ->assertJsonPath('data.status', 'arranging')
        ->assertJsonPath('data.server_seed', null)
        ->assertJsonCount(4, 'data.players');

    expect($res->json('data.cards'))->toHaveCount(13);
    foreach ($res->json('data.players') as $p) {
        expect($p)->not->toHaveKeys(['front', 'middle', 'back', 'score']);
    }

    $game = PracticeGame::query()->findOrFail($res->json('data.id'));
    $all = collect($game->hands)->flatten()->all();
    expect($all)->toHaveCount(52)->and(array_unique($all))->toHaveCount(52);
    // Bot cards never appear in the response.
    foreach ([2, 3, 4] as $seat) {
        foreach ($game->hands[$seat] as $card) {
            expect(str_contains($res->getContent(), "\"{$card}\""))->toBeFalse();
        }
    }
});

test('submitting scores zero-sum against three bots, reveals everything and touches no wallet', function () {
    $me = User::factory()->player()->create();
    $id = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice')->json('data.id');
    $game = PracticeGame::query()->findOrFail($id);
    $a = AutoArranger::arrange($game->hands[1]);

    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/preview", ['front' => $a->front, 'middle' => [], 'back' => []])
        ->assertOk()->assertJsonPath('data.complete', false);

    $res = $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back])
        ->assertCreated()->assertJsonPath('data.status', 'completed');

    $players = collect($res->json('data.players'));
    expect($players->sum('score'))->toBe(0);
    expect($players->firstWhere('is_you', true)['labels'])->toBe($a->labels());
    // "You vs bot" lanes mirror the bot's own score contribution against you.
    foreach ($players->where('is_you', false) as $bot) {
        expect(array_keys($bot['vs_you']))->toBe(['front', 'middle', 'back']);
    }
    expect(array_sum(array_merge(...array_map('array_values', $players->where('is_you', false)->pluck('vs_you')->all()))))
        ->toBe($players->firstWhere('is_you', true)['score']);

    $seed = $res->json('data.server_seed');
    expect(Deck::verify($seed, $res->json('data.deck_commitment')))->toBeTrue();
    expect(WalletTransaction::query()->count())->toBe(0);

    // Duplicate submission is refused.
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back])
        ->assertStatus(409);
});

test('practice rejects foreign cards and is private to its owner', function () {
    $me = User::factory()->player()->create();
    $other = User::factory()->player()->create();
    $id = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice')->json('data.id');
    $game = PracticeGame::query()->findOrFail($id);
    $bot = $game->hands[2];

    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", [
        'front' => array_slice($bot, 0, 3), 'middle' => array_slice($bot, 3, 5), 'back' => array_slice($bot, 8, 5),
    ])->assertStatus(422);

    $this->actingAs($other, 'sanctum')->getJson("/api/v1/practice/{$id}")->assertNotFound();
    $this->actingAs($other, 'sanctum')->postJson("/api/v1/practice/{$id}/preview", ['front' => []])->assertNotFound();

    // Starting a new practice abandons the unfinished one.
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice')->assertCreated();
    expect($game->fresh()->status)->toBe('abandoned');

    $this->getJson("/api/v1/practice/{$id}")->assertOk(); // still readable by its owner
    auth()->forgetGuards();
    $this->getJson("/api/v1/practice/{$id}")->assertUnauthorized();
});
