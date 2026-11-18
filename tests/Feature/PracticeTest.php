<?php

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Game\AutoArranger;
use App\Game\Deck;
use App\Game\LuckyHand;
use App\Models\AuditLog;
use App\Models\PracticeGame;
use App\Models\PracticeMatch;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Game\PracticeService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/** A player holding $gold CP (default: exactly the Beginner minimum). */
function practicePlayer(int $gold = 1_000): User
{
    $u = User::factory()->player()->create();
    fund($u, $gold * 100, Currency::CP);

    return $u;
}

function spStartMatch($test, User $u, string $tier = 'beginner'): int
{
    return $test->actingAs($u, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => $tier])->assertCreated()->json('data.id');
}

function spDealRound($test, User $u, int $match, int $bet = 50, ?string $req = null)
{
    return $test->actingAs($u, 'sanctum')->postJson("/api/v1/practice/matches/{$match}/deal", array_filter(['bet' => $bet, 'request_id' => $req]));
}

/**
 * Re-deal a round: $hands is seat => 13 cards for the seats to fix; the other
 * seats get the rest of the deck. Bots are re-arranged by the server arranger.
 */
function spRigRound(int $gameId, array $hands): PracticeGame
{
    $game = PracticeGame::query()->findOrFail($gameId);
    $rest = array_values(array_diff(Deck::ordered(), ...array_values($hands)));
    shuffle($rest);

    foreach ([1, 2, 3, 4] as $seat) {
        if (! isset($hands[$seat])) {
            $hands[$seat] = array_splice($rest, 0, 13);
        }
    }
    ksort($hands);

    $arr = [];
    foreach ([2, 3, 4] as $seat) {
        $a = AutoArranger::arrange($hands[$seat]);
        $arr[$seat] = ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back];
    }
    $game->forceFill(['hands' => $hands, 'arrangements' => $arr])->save();

    return $game;
}

/** Pin each non-banker seat's bet (free-play rounds only: no reserves are adjusted). */
function spSetBets(int $gameId, array $bets): void
{
    PracticeGame::query()->findOrFail($gameId)->forceFill(['bets' => $bets])->save();
}

function spSubmitAuto($test, User $u, int $gameId)
{
    $a = AutoArranger::arrange(PracticeGame::query()->findOrFail($gameId)->hands[1]);

    return $test->actingAs($u, 'sanctum')->postJson("/api/v1/practice/{$gameId}/submit", ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back]);
}

// Five pairs, no flush or straight possible, not a Lucky Hand — and the same ranks with suits swapped.
const PAIRS = ['AS', 'AH', 'KS', 'KH', 'QD', 'QC', '9S', '9H', '7D', '7C', '4S', '2H', '3D'];
const PAIRS_COPY = ['AH', 'AS', 'KH', 'KS', 'QC', 'QD', '9H', '9S', '7C', '7D', '4H', '2S', '3C'];

/** Every round must be zero-sum, every non-banker lane decided (banker advantage), and multiples follow the table. */
function spAssertSettlement(array $round): void
{
    $players = collect($round['players']);
    expect($players)->toHaveCount(4)->and($players->sum('gold'))->toBe(0);
    expect($players->where('is_banker', true))->toHaveCount(1);
    $table = ['3-0' => 2, '2-1' => 1, '1-2' => -1, '0-3' => -2];

    foreach ($players->where('is_banker', false) as $p) {
        if ($p['lanes'] === null) {
            continue; // a Lucky Hand decided this pairing
        }
        expect(array_values(array_unique(array_map('abs', $p['lanes']))))->toBe([1]); // no ties
        $w = count(array_filter($p['lanes'], fn ($o) => $o > 0));
        expect($p['multiple'])->toBe($table[$w.'-'.(3 - $w)]);
        expect($p['gold'])->toBe($p['multiple'] * $p['bet']); // each seat plays its own bet
    }
}

test('difficulty tiers list minimum gold, bet options and eligibility', function () {
    $me = practicePlayer();

    $res = $this->actingAs($me, 'sanctum')->getJson('/api/v1/practice/tiers')->assertOk()
        ->assertJsonPath('meta.rounds', 12)->assertJsonPath('meta.wagering', false);
    $tiers = collect($res->json('data'));

    expect($tiers->pluck('key')->all())->toBe(['beginner', 'intermediate', 'advanced', 'mastery']);
    expect($tiers->pluck('min_gold')->all())->toBe([1000, 10000, 100000, 1000000]);
    expect($tiers->pluck('eligible', 'key')->all())->toBe(['beginner' => true, 'intermediate' => false, 'advanced' => false, 'mastery' => false]);
});

test('a match needs a valid tier and enough gold', function () {
    $me = practicePlayer();
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/matches', [])->assertStatus(422)->assertJsonValidationErrors('tier');
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => 'intermediate'])->assertStatus(422)->assertJsonPath('error', 'insufficient_gold');

    $broke = User::factory()->player()->create();
    $this->actingAs($broke, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => 'beginner'])->assertStatus(422)->assertJsonPath('error', 'insufficient_gold');
    expect(PracticeMatch::query()->count())->toBe(0);
});

test('four seats: you and three bots each get 13 of the 52 cards; bots stay hidden; one round at a time', function () {
    $me = practicePlayer();
    $match = spStartMatch($this, $me);

    $this->actingAs($me, 'sanctum')->getJson('/api/v1/practice/matches/current')
        ->assertJsonPath('data.next_round', 1)->assertJsonPath('data.next_banker', 1)->assertJsonPath('data.next_banker_name', 'You')
        ->assertJsonCount(4, 'data.standings');


    $res = spDealRound($this, $me, $match, 100, 'req-1')->assertCreated()
        ->assertJsonPath('data.round', 1)->assertJsonPath('data.banker', 1)->assertJsonPath('data.bet', 0) // the banker places no bet
        ->assertJsonPath('data.result', null)->assertJsonPath('data.server_seed', null)->assertJsonCount(4, 'data.players');
    expect(collect($res->json('data.players'))->pluck('name')->all())->toBe(['You', 'LuckyBot', 'CardBot', 'AceBot']);
    expect($res->json('data.cards'))->toHaveCount(13);
    foreach ([1, 2, 3] as $i) {
        expect($res->json("data.players.{$i}"))->not->toHaveKeys(['front', 'middle', 'back']);
    }

    $game = PracticeGame::query()->findOrFail($res->json('data.id'));
    $all = array_merge(...array_values($game->hands));
    expect($all)->toHaveCount(52)->and(array_unique($all))->toHaveCount(52);
    foreach ([2, 3, 4] as $seat) {
        expect($game->arrangements[$seat])->toHaveKeys(['front', 'middle', 'back']);
        foreach ($game->hands[$seat] as $card) {
            expect(str_contains($res->getContent(), "\"{$card}\""))->toBeFalse();
        }
    }

    spDealRound($this, $me, $match, 100, 'req-1')->assertOk()->assertJsonPath('data.id', $game->id);
    spDealRound($this, $me, $match, 50)->assertStatus(409)->assertJsonPath('error', 'round_in_progress');
    expect(PracticeGame::query()->count())->toBe(1);
});

test('banker advantage: identical lanes go to the banker, both when you bank and when a bot banks', function () {
    $me = practicePlayer();
    $match = spStartMatch($this, $me);

    // Round 1: you bank. LuckyBot holds the same ranks → it loses every lane → −2 × bet to you.
    $id = spDealRound($this, $me, $match, 100)->json('data.id');
    spRigRound($id, [1 => PAIRS, 2 => PAIRS_COPY]);
    spSetBets($id, [2 => 100, 3 => 100, 4 => 100]);
    $res = spSubmitAuto($this, $me, $id)->assertCreated()->assertJsonPath('data.players.0.is_banker', true);
    $lucky = collect($res->json('data.players'))->firstWhere('seat', 2);
    expect($lucky['lanes'])->toBe(['front' => -1, 'middle' => -1, 'back' => -1])->and($lucky['multiple'])->toBe(-2)->and($lucky['gold'])->toBe(-200);
    expect($res->json('data.result.gold'))->toBe(-collect($res->json('data.players'))->where('is_you', false)->sum('gold'));
    spAssertSettlement($res->json('data'));

    // Round 2: LuckyBot banks. You hold its ranks → you lose every lane → −2 × bet.
    $id2 = spDealRound($this, $me, $match, 50)->assertJsonPath('data.banker', 2)->json('data.id');
    spRigRound($id2, [2 => PAIRS, 1 => PAIRS_COPY]);
    $res2 = spSubmitAuto($this, $me, $id2)->assertCreated()
        ->assertJsonPath('data.result.lanes', ['front' => -1, 'middle' => -1, 'back' => -1])
        ->assertJsonPath('data.result.multiple', -2)
        ->assertJsonPath('data.result.gold', -100)
        ->assertJsonPath('data.banker_name', 'LuckyBot');
    spAssertSettlement($res2->json('data'));
});

test('every round settles each non-banker against the banker by the 2× / 1× table', function () {
    $me = practicePlayer();
    $match = spStartMatch($this, $me);
    $id = spDealRound($this, $me, $match, 100)->json('data.id');
    spRigRound($id, [1 => PAIRS]);

    $res = spSubmitAuto($this, $me, $id)->assertCreated();
    spAssertSettlement($res->json('data'));
    spSubmitAuto($this, $me, $id)->assertStatus(409);

    $this->actingAs($me, 'sanctum')->getJson('/api/v1/practice/matches/current')->assertOk()
        ->assertJsonPath('data.rounds_played', 1)->assertJsonPath('data.gold', $res->json('data.result.gold'))
        ->assertJsonPath('data.next_round', 2)->assertJsonPath('data.next_banker', 2)->assertJsonPath('data.next_banker_name', 'LuckyBot');
    // Gold wagering is off by default: no ledger rows for Single Player.
    expect(WalletTransaction::query()->where('reason', 'like', 'Single Player%')->count())->toBe(0);
});

test('a match is 12 rounds; the banker rotates You → LuckyBot → CardBot → AceBot; standings add up', function () {
    $me = practicePlayer();
    $match = spStartMatch($this, $me);
    $bankers = [];
    $mine = 0;

    for ($r = 1; $r <= 12; $r++) {
        $res = spDealRound($this, $me, $match, [50, 100, 500][$r % 3])->assertCreated();
        $bankers[] = $res->json('data.banker');
        $settled = spSubmitAuto($this, $me, $res->json('data.id'))->assertCreated();
        spAssertSettlement($settled->json('data'));
        $mine += $settled->json('data.result.gold');
    }

    expect($bankers)->toBe([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]);
    $m = PracticeMatch::query()->findOrFail($match);
    expect($m->status)->toBe('completed')->and($m->rounds_played)->toBe(12)->and(intdiv($m->player_net, 100))->toBe($mine);
    spDealRound($this, $me, $match, 50)->assertStatus(409)->assertJsonPath('error', 'match_over');

    $summary = $this->actingAs($me, 'sanctum')->getJson("/api/v1/practice/matches/{$match}")->assertOk()
        ->assertJsonPath('data.status', 'completed')->assertJsonCount(12, 'data.history')->assertJsonPath('data.gold', $mine);
    $standings = collect($summary->json('data.standings'));
    expect($standings->sum('gold'))->toBe(0)->and($standings->firstWhere('seat', 1)['gold'])->toBe($mine);
    $this->actingAs($me, 'sanctum')->getJson('/api/v1/practice/matches/current')->assertJsonPath('data', null);
});

test('Declared Luck: server-detected, settles once at the lucky multiple against every bot; bots declare their own', function () {
    $me = practicePlayer();
    $match = spStartMatch($this, $me);
    $sixPairs = ['2C', '2D', '3C', '3D', '4C', '4D', '5C', '5D', '6C', '6D', '7C', '7D', '8C'];

    // Round 1 (you bank): six pairs → +2 × bet from each of the three bots (none lucky).
    $id = spDealRound($this, $me, $match, 100)->json('data.id');
    do {
        $g = spRigRound($id, [1 => $sixPairs]);
        spSetBets($id, [2 => 100, 3 => 100, 4 => 100]);
        $botLuck = array_filter([2, 3, 4], fn ($s) => LuckyHand::detect($g->hands[$s]) !== null);
    } while ($botLuck !== []);
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/lucky")->assertCreated()
        ->assertJsonPath('data.lucky.type', 'six_pairs')->assertJsonPath('data.result.gold', 600);
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/lucky")->assertStatus(409);
    expect(AuditLog::query()->where('action', 'practice.lucky_declared')->count())->toBe(1);

    // Round 2: no luck → 422, the round stays open and is played normally.
    $id2 = spDealRound($this, $me, $match, 50)->json('data.id');
    spRigRound($id2, [1 => PAIRS]);
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id2}/lucky")->assertStatus(422)->assertJsonPath('error', 'not_lucky');
    expect(PracticeGame::query()->find($id2)->status)->toBe('arranging');
    spSubmitAuto($this, $me, $id2)->assertCreated();

    // Round 3 (CardBot banks): AceBot holds three flushes → it declares and beats the banker 2 × bet.
    $id3 = spDealRound($this, $me, $match, 50)->assertJsonPath('data.banker', 3)->json('data.id');
    $res = spRigRound($id3, [4 => ['2H', '5H', '9H', '3S', '6S', '8S', 'JS', 'KS', '2C', '4C', '7C', 'TC', 'QC']]);
    $out = spSubmitAuto($this, $me, $id3)->assertCreated();
    $ace = collect($out->json('data.players'))->firstWhere('seat', 4);
    expect($ace['lucky']['type'])->toBe('three_flushes')->and($ace['gold'])->toBe(2 * $ace['bet'])->and($ace['lanes'])->toBeNull();
    expect(collect($out->json('data.players'))->sum('gold'))->toBe(0);
});

test('rounds and matches are private to their owner; a new match abandons the old one', function () {
    $me = practicePlayer();
    $other = practicePlayer();
    $match = spStartMatch($this, $me);
    $id = spDealRound($this, $me, $match)->json('data.id');

    $this->actingAs($other, 'sanctum')->getJson("/api/v1/practice/{$id}")->assertNotFound();
    $this->actingAs($other, 'sanctum')->postJson("/api/v1/practice/{$id}/suggest")->assertNotFound();
    $this->actingAs($other, 'sanctum')->postJson("/api/v1/practice/matches/{$match}/deal", ['bet' => 50])->assertNotFound();
    $this->actingAs($other, 'sanctum')->getJson('/api/v1/practice/matches/current')->assertJsonPath('data', null);

    $s = $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/suggest")->assertOk();
    expect($s->json('data.back'))->toHaveCount(5);
    expect(PracticeGame::query()->find($id)->status)->toBe('arranging');

    spStartMatch($this, $me);
    expect(PracticeMatch::query()->find($match)->status)->toBe('abandoned')->and(PracticeGame::query()->find($id)->status)->toBe('abandoned');
});

test('with CP wagering on, your worst case is reserved per round and Gold settles exactly once', function () {
    config(['pusoy.features.cp_wagering' => true]);
    $wallets = app(WalletService::class);
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::ManualAdjustment, Currency::CP, null, $wallets->platform(Currency::CP), 1_000_000, 'test house bank'));
    $me = practicePlayer(5_000);
    $house = fn () => $wallets->platform(Currency::CP)->fresh()->balance;
    $escrow = fn () => $wallets->escrow(Currency::CP)->fresh()->balance;

    $match = spStartMatch($this, $me);

    // Round 1, you bank (no bet of your own) and cover the bots' bets: 2 × their total is reserved from each side.
    $deal = spDealRound($this, $me, $match)->assertCreated()->assertJsonPath('data.wagering', true)->assertJsonPath('data.bet', 0);
    $id = $deal->json('data.id');
    $covered = $deal->json('data.covered');
    expect($covered)->toBe(collect($deal->json('data.players'))->where('is_you', false)->sum('bet'))->toBeGreaterThanOrEqual(150);
    $deal->assertJsonPath('data.reserved', 2 * $covered);
    expect(balance($me, Currency::CP))->toBe((5_000 - 2 * $covered) * 100)->and($house())->toBe(1_000_000 - 2 * $covered * 100)->and($escrow())->toBe(4 * $covered * 100);
    expect($wallets->reconcile()['ok'])->toBeTrue();

    $gold = spSubmitAuto($this, $me, $id)->assertCreated()->json('data.result.gold');
    expect(balance($me, Currency::CP))->toBe((5_000 + $gold) * 100)->and($house())->toBe(1_000_000 - $gold * 100)->and($escrow())->toBe(0);
    expect($wallets->reconcile()['ok'])->toBeTrue();

    $count = WalletTransaction::query()->count();
    spSubmitAuto($this, $me, $id)->assertStatus(409);
    expect(WalletTransaction::query()->count())->toBe($count);

    // Round 2 (LuckyBot banks): you hold its ranks → lose 2 × 500 exactly.
    $before = balance($me, Currency::CP);
    $id2 = spDealRound($this, $me, $match, 500)->assertJsonPath('data.reserved', 1000)->json('data.id');
    spRigRound($id2, [2 => PAIRS, 1 => PAIRS_COPY]);
    spSubmitAuto($this, $me, $id2)->assertJsonPath('data.result.gold', -1000);
    expect(balance($me, Currency::CP))->toBe($before - 1_000_00)->and($escrow())->toBe(0);

    // Abandoning a match with an open round returns both reserves.
    $before = balance($me, Currency::CP);
    $houseBefore = $house();
    spDealRound($this, $me, $match, 500);
    expect(balance($me, Currency::CP))->toBe($before - 1_000_00);
    spStartMatch($this, $me);
    expect(balance($me, Currency::CP))->toBe($before)->and($house())->toBe($houseBefore)->and($escrow())->toBe(0);
    expect($wallets->reconcile()['ok'])->toBeTrue();

    // The house must be able to cover the round.
    $poor = practicePlayer(1_000);
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::PlayerDebit, Currency::CP, $wallets->platform(Currency::CP), null, $house(), 'drain'));
    $m2 = spStartMatch($this, $poor);
    spDealRound($this, $poor, $m2, 50)->assertStatus(422)->assertJsonPath('error', 'house_insufficient');
    expect(balance($poor, Currency::CP))->toBe(1_000_00)->and(PracticeGame::query()->where('practice_match_id', $m2)->count())->toBe(0);
});

test('the fixed test hands are not Lucky Hands', function () {
    expect(LuckyHand::detect(PAIRS))->toBeNull()->and(LuckyHand::detect(PAIRS_COPY))->toBeNull();
});

test('casual bots never foul', function () {
    $hands = Deck::deal(Deck::shuffled(Deck::newSeed()));
    foreach (range(1, 20) as $_) {
        expect(PracticeService::casualArrange($hands[2])->isFoul())->toBeFalse();
    }
});

// Back (two pair) weaker than Middle (two pair, aces & kings) = misplaced.
const MISPLACED = ['front' => ['2H', '3D', '4S'], 'middle' => ['AS', 'AH', 'KS', 'KH', 'QD'], 'back' => ['QC', '9S', '9H', '7D', '7C']];

test('a misplaced hand can be submitted and pays 2 × bet: as a player to the banker, as banker to every opponent', function () {
    $me = practicePlayer();
    $match = spStartMatch($this, $me);

    // Round 1: you bank and misplace → each of the three bots wins every lane: you pay 3 × 2 × 100.
    $id = spDealRound($this, $me, $match, 100)->json('data.id');
    spRigRound($id, [1 => PAIRS]);
    spSetBets($id, [2 => 100, 3 => 100, 4 => 100]);
    $res = $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", MISPLACED)->assertCreated()
        ->assertJsonPath('data.result.misplaced', true)
        ->assertJsonPath('data.result.gold', -600)
        ->assertJsonPath('data.players.0.is_foul', true);
    foreach (collect($res->json('data.players'))->where('is_you', false) as $bot) {
        expect($bot['gold'])->toBe(200)->and($bot['is_foul'])->toBeFalse();
    }
    spAssertSettlement($res->json('data'));

    // Only once: a second submit is refused and nothing changes.
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", MISPLACED)->assertStatus(409);
    $this->actingAs($me, 'sanctum')->getJson('/api/v1/practice/matches/current')->assertJsonPath('data.gold', -600)->assertJsonPath('data.rounds_played', 1);

    // Round 2: LuckyBot banks, you misplace → you pay 2 × 50 to the banker.
    $id2 = spDealRound($this, $me, $match, 50)->json('data.id');
    spRigRound($id2, [1 => PAIRS, 2 => PAIRS_COPY]);
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id2}/submit", MISPLACED)->assertCreated()
        ->assertJsonPath('data.result.misplaced', true)
        ->assertJsonPath('data.result.lanes', ['front' => -1, 'middle' => -1, 'back' => -1])
        ->assertJsonPath('data.result.gold', -100);

    // Cards that are not yours are still refused.
    $id3 = spDealRound($this, $me, $match, 50)->json('data.id');
    $g = spRigRound($id3, [1 => PAIRS]);
    $theirs = $g->hands[2];
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id3}/submit", ['front' => array_slice($theirs, 0, 3), 'middle' => array_slice($theirs, 3, 5), 'back' => array_slice($theirs, 8, 5)])
        ->assertStatus(422)->assertJsonPath('error', 'invalid_arrangement');
});

test('with CP wagering on, a misplaced hand as banker pays 2 × every bot bet from the reserve, exactly once', function () {
    config(['pusoy.features.cp_wagering' => true]);
    $wallets = app(WalletService::class);
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::ManualAdjustment, Currency::CP, null, $wallets->platform(Currency::CP), 1_000_000, 'test house bank'));
    $me = practicePlayer(5_000);

    $match = spStartMatch($this, $me);
    $deal = spDealRound($this, $me, $match);
    $id = $deal->json('data.id');
    $covered = $deal->json('data.covered');
    spRigRound($id, [1 => PAIRS]);
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", MISPLACED)->assertCreated()->assertJsonPath('data.result.gold', -2 * $covered);

    expect(balance($me, Currency::CP))->toBe((5_000 - 2 * $covered) * 100)
        ->and($wallets->platform(Currency::CP)->fresh()->balance)->toBe(1_000_000 + 2 * $covered * 100)
        ->and($wallets->escrow(Currency::CP)->fresh()->balance)->toBe(0);
    $count = WalletTransaction::query()->count();
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", MISPLACED)->assertStatus(409);
    expect(WalletTransaction::query()->count())->toBe($count)->and($wallets->reconcile()['ok'])->toBeTrue();
});

test('the banker places no bet; every other seat places its own from the tier options', function () {
    $me = practicePlayer();
    $match = spStartMatch($this, $me);

    // Round 1: you bank. Any bet you send is ignored; the bots bet on their own.
    $r1 = spDealRound($this, $me, $match, 500)->assertCreated()->assertJsonPath('data.bet', 0)->assertJsonPath('data.players.0.bet', 0);
    $bots = collect($r1->json('data.players'))->where('is_you', false);
    foreach ($bots as $b) {
        expect($b['bet'])->toBeIn([50, 100, 500]);
    }
    expect($r1->json('data.covered'))->toBe($bots->sum('bet'));
    $done = spSubmitAuto($this, $me, $r1->json('data.id'))->assertCreated();
    spAssertSettlement($done->json('data'));
    expect($done->json('data.result.gold'))->toBe(-collect($done->json('data.players'))->where('is_you', false)->sum('gold'));

    // Round 2: LuckyBot banks (no bet); you and the other two bots bet. Your bet must be one of the options.
    spDealRound($this, $me, $match, 5000)->assertStatus(422)->assertJsonPath('error', 'invalid_bet');
    $r2 = spDealRound($this, $me, $match, 100)->assertCreated()->assertJsonPath('data.bet', 100)->assertJsonPath('data.covered', 0);
    $players = collect($r2->json('data.players'));
    expect($players->firstWhere('seat', 2)['bet'])->toBe(0)->and($players->firstWhere('seat', 1)['bet'])->toBe(100);
    expect($players->firstWhere('seat', 3)['bet'])->toBeIn([50, 100, 500])->and($players->firstWhere('seat', 4)['bet'])->toBeIn([50, 100, 500]);
    spDealRound($this, $me, $match, 5000)->assertStatus(409); // round still open
    spAssertSettlement(spSubmitAuto($this, $me, $r2->json('data.id'))->json('data'));

    $this->actingAs($me, 'sanctum')->getJson("/api/v1/practice/matches/{$match}")
        ->assertJsonPath('data.history.0.bet', 0)->assertJsonPath('data.history.0.covered', $r1->json('data.covered'))
        ->assertJsonPath('data.history.1.bet', 100);
});

test('with CP wagering on, bots never bet more than the player-banker can cover', function () {
    config(['pusoy.features.cp_wagering' => true]);
    $wallets = app(WalletService::class);
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::ManualAdjustment, Currency::CP, null, $wallets->platform(Currency::CP), 10_000_000, 'test house bank'));

    foreach (range(1, 8) as $_) {
        $me = practicePlayer(1_000);
        $match = spStartMatch($this, $me);
        $deal = spDealRound($this, $me, $match)->assertCreated();
        expect(2 * $deal->json('data.covered'))->toBeLessThanOrEqual(1_000);
        expect(balance($me, Currency::CP))->toBe((1_000 - 2 * $deal->json('data.covered')) * 100);
    }
});

test('Single Player has no timer at any level: a round waits indefinitely and is never auto-submitted', function () {
    $rich = practicePlayer(1_000_000);

    foreach (['beginner', 'intermediate', 'advanced', 'mastery'] as $tier) {
        $match = spStartMatch($this, $rich, $tier);
        $deal = spDealRound($this, $rich, $match)->assertCreated();
        $id = $deal->json('data.id');
        expect($deal->json('data'))->not->toHaveKeys(['deadline', 'expires_at', 'seconds_left', 'arrangement_seconds']);

        // Days pass and the background sweeper runs: the round is still open and untouched.
        $this->travel(3)->days();
        $this->artisan('pusoy:sweep')->assertSuccessful();
        expect(PracticeGame::query()->find($id)->status)->toBe('arranging');
        $this->actingAs($rich, 'sanctum')->getJson('/api/v1/practice/matches/current')->assertJsonPath('data.current.id', $id);

        // The player can still rearrange (preview) and submit whenever ready.
        $this->actingAs($rich, 'sanctum')->postJson("/api/v1/practice/{$id}/preview", ['front' => [], 'middle' => [], 'back' => []])->assertOk();
        spSubmitAuto($this, $rich, $id)->assertCreated()->assertJsonPath('data.status', 'completed');
    }
});
