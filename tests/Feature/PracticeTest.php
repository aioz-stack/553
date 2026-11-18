<?php

use App\Enums\Currency;
use App\Game\AutoArranger;
use App\Game\Deck;
use App\Models\PracticeGame;
use App\Models\User;
use App\Models\WalletTransaction;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/** A player holding exactly the Beginner minimum (1,000 CP). */
function practicePlayer(): User
{
    $u = User::factory()->player()->create();
    fund($u, 1_000_00, Currency::CP);

    return $u;
}

const BEGINNER = ['tier' => 'beginner', 'bet' => 50];

test('single player practice deals 13 private cards and hides the bots until submit', function () {
    $me = practicePlayer();

    $res = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice', BEGINNER)->assertCreated()
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
    $me = practicePlayer();
    $ledgerBefore = WalletTransaction::query()->count();
    $id = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice', BEGINNER)->json('data.id');
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
    expect(WalletTransaction::query()->count())->toBe($ledgerBefore);
    expect(balance($me, Currency::CP))->toBe(1_000_00);
    expect($res->json('data.bet'))->toBe(50)->and($res->json('data.tier.key'))->toBe('beginner');
    expect($players->firstWhere('is_you', true)['stake_result'])->toBe($players->firstWhere('is_you', true)['score'] * 50);

    // Duplicate submission is refused.
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back])
        ->assertStatus(409);
});

test('practice rejects foreign cards and is private to its owner', function () {
    $me = practicePlayer();
    $other = User::factory()->player()->create();
    $id = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice', BEGINNER)->json('data.id');
    $game = PracticeGame::query()->findOrFail($id);
    $bot = $game->hands[2];

    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", [
        'front' => array_slice($bot, 0, 3), 'middle' => array_slice($bot, 3, 5), 'back' => array_slice($bot, 8, 5),
    ])->assertStatus(422);

    $this->actingAs($other, 'sanctum')->getJson("/api/v1/practice/{$id}")->assertNotFound();
    $this->actingAs($other, 'sanctum')->postJson("/api/v1/practice/{$id}/preview", ['front' => []])->assertNotFound();

    // Starting a new practice abandons the unfinished one.
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice', BEGINNER)->assertCreated();
    expect($game->fresh()->status)->toBe('abandoned');

    $this->getJson("/api/v1/practice/{$id}")->assertOk(); // still readable by its owner
    auth()->forgetGuards();
    $this->getJson("/api/v1/practice/{$id}")->assertUnauthorized();
});

test('difficulty tiers list minimum gold, bet options and the player\'s eligibility', function () {
    $me = practicePlayer();

    $tiers = collect($this->actingAs($me, 'sanctum')->getJson('/api/v1/practice/tiers')->assertOk()->json('data'));

    expect($tiers->pluck('key')->all())->toBe(['beginner', 'intermediate', 'advanced', 'mastery']);
    expect($tiers->pluck('min_gold')->all())->toBe([1000, 10000, 100000, 1000000]);
    expect($tiers->firstWhere('key', 'mastery')['bets'])->toBe([50000, 100000, 500000]);
    expect($tiers->pluck('eligible', 'key')->all())->toBe(['beginner' => true, 'intermediate' => false, 'advanced' => false, 'mastery' => false]);

    $this->getJson('/api/v1/practice/tiers')->assertOk(); // still authed in this test
    auth()->forgetGuards();
    $this->getJson('/api/v1/practice/tiers')->assertUnauthorized();
});

test('the backend validates the selected tier, bet and minimum gold before dealing', function () {
    $me = practicePlayer();
    $as = fn () => $this->actingAs($me, 'sanctum');

    $as()->postJson('/api/v1/practice', [])->assertStatus(422)->assertJsonValidationErrors('tier');
    $as()->postJson('/api/v1/practice', ['tier' => 'legendary', 'bet' => 50])->assertStatus(422)->assertJsonValidationErrors('tier');
    // A bet from another tier is refused.
    $as()->postJson('/api/v1/practice', ['tier' => 'beginner', 'bet' => 5000])->assertStatus(422)->assertJsonPath('error', 'invalid_bet');
    // Intermediate needs 10,000 gold; this player holds 1,000.
    $as()->postJson('/api/v1/practice', ['tier' => 'intermediate', 'bet' => 500])->assertStatus(422)->assertJsonPath('error', 'insufficient_gold');

    $broke = User::factory()->player()->create();
    $this->actingAs($broke, 'sanctum')->postJson('/api/v1/practice', BEGINNER)->assertStatus(422)->assertJsonPath('error', 'insufficient_gold');

    expect(PracticeGame::query()->count())->toBe(0);
});

test('a repeated request id returns the same deal instead of starting a duplicate', function () {
    $me = practicePlayer();
    $body = BEGINNER + ['request_id' => 'a1b2c3d4-0000-4000-8000-000000000001'];

    $first = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice', $body)->assertCreated();
    $again = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice', $body)->assertOk();

    expect($again->json('data.id'))->toBe($first->json('data.id'))
        ->and($again->json('data.cards'))->toBe($first->json('data.cards'));
    expect(PracticeGame::query()->where('user_id', $me->id)->count())->toBe(1);
    expect(PracticeGame::query()->first()->status)->toBe('arranging');
});

test('beginner bots arrange casually but never foul; mastery bots use the full arranger', function () {
    $hands = Deck::deal(Deck::shuffled(Deck::newSeed()));
    foreach (range(1, 20) as $_) {
        expect(App\Services\Game\PracticeService::casualArrange($hands[2])->isFoul())->toBeFalse();
    }

    $rich = User::factory()->player()->create();
    fund($rich, 1_000_000_00, Currency::CP);
    $id = $this->actingAs($rich, 'sanctum')->postJson('/api/v1/practice', ['tier' => 'mastery', 'bet' => 100000])->assertCreated()->json('data.id');
    $game = PracticeGame::query()->findOrFail($id);

    foreach ([2, 3, 4] as $seat) {
        $a = AutoArranger::arrange($game->hands[$seat]);
        expect($game->arrangements[$seat])->toBe(['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back]);
    }
});

test('choosing only a difficulty starts the game at that tier\'s lowest bet', function () {
    $me = practicePlayer();

    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice', ['tier' => 'beginner'])->assertCreated()
        ->assertJsonPath('data.tier.key', 'beginner')
        ->assertJsonPath('data.bet', 50);

    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice', ['tier' => 'intermediate'])
        ->assertStatus(422)->assertJsonPath('error', 'insufficient_gold');
});
