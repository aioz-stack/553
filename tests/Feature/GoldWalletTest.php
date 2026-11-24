<?php

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Models\AuditLog;
use App\Models\PracticeGame;
use App\Models\PracticeMatch;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

// Back (two pair) weaker than Middle (aces & kings): a misplaced hand, loses every lane.
const GW_MISPLACED = ['front' => ['2H', '3D', '4S'], 'middle' => ['AS', 'AH', 'KS', 'KH', 'QD'], 'back' => ['QC', '9S', '9H', '7D', '7C']];
const GW_HAND = ['AS', 'AH', 'KS', 'KH', 'QD', 'QC', '9S', '9H', '7D', '7C', '4S', '2H', '3D'];

function gwPlayer(int $gold): User
{
    $u = User::factory()->player()->create();
    if ($gold > 0) {
        fund($u, $gold * 100, Currency::GD);
    }

    return $u;
}

function gwState($test, User $u)
{
    return $test->actingAs($u, 'sanctum')->getJson('/api/v1/practice/gold')->assertOk();
}

/**
 * Play round 1 (you bank) of a new Beginner match and lose every last Gold:
 * the free Gold beyond the round's reserve is spent first, then a misplaced hand loses the reserve.
 */
function gwBust($test, User $u): array
{
    $match = $test->actingAs($u, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => 'beginner'])->assertCreated()->json('data.id');
    $id = $test->actingAs($u, 'sanctum')->postJson("/api/v1/practice/matches/{$match}/deal", [])->assertCreated()->json('data.id');

    // The reserve is held: not Out of Gold while the round is open.
    gwState($test, $u)->assertJsonPath('data.out_of_gold', false);

    $wallets = app(WalletService::class);
    $free = balance($u, Currency::GD);
    if ($free > 0) {
        app(LedgerService::class)->transfer(new TransferRequest(TransactionType::PlayerDebit, Currency::GD, $wallets->for($u, Currency::GD), null, $free, 'test: spend the rest'));
    }

    $game = PracticeGame::query()->findOrFail($id);
    $hands = $game->hands;
    $other = $hands[1];
    foreach ($hands as $seat => $cards) {
        if (array_intersect($cards, GW_HAND) !== []) {
            $hands[$seat] = array_values(array_diff($cards, GW_HAND));
        }
    }
    // Swap GW_HAND into seat 1 and give its old cards to whoever lost them.
    $pool = array_values(array_diff($other, GW_HAND));
    foreach ($hands as $seat => $cards) {
        if ($seat !== 1) {
            while (count($hands[$seat]) < 13) {
                $hands[$seat][] = array_shift($pool);
            }
        }
    }
    $hands[1] = GW_HAND;
    $arrangements = [];
    foreach ([2, 3, 4] as $seat) {
        $a = \App\Game\AutoArranger::arrange($hands[$seat]);
        $arrangements[$seat] = ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back];
    }
    $game->forceFill(['hands' => $hands, 'arrangements' => $arrangements])->save();

    $res = $test->actingAs($u, 'sanctum')->postJson("/api/v1/practice/{$id}/submit", GW_MISPLACED)->assertCreated();

    return [$match, $res];
}

test('losing your last Gold ends the Single Player match at once: no further round, Out of Gold, claim offered', function () {
    $me = gwPlayer(1_000);
    [$match, $res] = gwBust($this, $me);

    expect($res->json('data.result.gold'))->toBeLessThan(0)->and(balance($me, Currency::GD))->toBe(0);
    expect(PracticeMatch::query()->find($match)->status)->toBe(PracticeMatch::OUT_OF_GOLD);

    $this->actingAs($me, 'sanctum')->getJson("/api/v1/practice/matches/{$match}")->assertOk()
        ->assertJsonPath('data.out_of_gold', true)->assertJsonPath('data.status', 'out_of_gold')
        ->assertJsonPath('data.gold_wallet.out_of_gold', true)->assertJsonPath('data.gold_wallet.can_claim', true);
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/matches/{$match}/deal", ['bet' => 50])->assertStatus(409)->assertJsonPath('error', 'out_of_gold');
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => 'beginner'])->assertStatus(409)->assertJsonPath('error', 'out_of_gold');
    $this->actingAs($me, 'sanctum')->getJson('/api/v1/practice/matches/current')->assertJsonPath('data', null);

    gwState($this, $me)->assertJsonPath('data.gold', '0.00')->assertJsonPath('data.out_of_gold', true)
        ->assertJsonPath('data.can_claim', true)->assertJsonPath('data.claim_amount', 1000);
    expect(AuditLog::query()->where('action', 'practice.out_of_gold')->count())->toBe(1);
    expect(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('Out of Gold means you cannot keep playing: below the Beginner minimum between matches, or unable to cover the next round', function () {
    gwState($this, gwPlayer(0))->assertJsonPath('data.out_of_gold', true);
    gwState($this, gwPlayer(999))->assertJsonPath('data.out_of_gold', true)->assertJsonPath('data.minimum_to_start', 1000);
    gwState($this, gwPlayer(1_000))->assertJsonPath('data.out_of_gold', false)->assertJsonPath('data.can_claim', false);

    // Mid-match only the next round's smallest reserve matters (2 × 50 when a bot banks).
    $me = gwPlayer(1_000);
    $match = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => 'beginner'])->json('data.id');
    PracticeMatch::query()->whereKey($match)->update(['rounds_played' => 1]);
    $wallets = app(WalletService::class);
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::PlayerDebit, Currency::GD, $wallets->for($me, Currency::GD), null, 880_00, 'test'));
    gwState($this, $me)->assertJsonPath('data.gold', '120.00')->assertJsonPath('data.out_of_gold', false);
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::PlayerDebit, Currency::GD, $wallets->for($me, Currency::GD), null, 30_00, 'test'));
    gwState($this, $me)->assertJsonPath('data.out_of_gold', true);
});

test('claiming the free 1,000 Gold: only when Out of Gold, credited straight to Gold, once however often it is pressed', function () {
    $rich = gwPlayer(5_000);
    $this->actingAs($rich, 'sanctum')->postJson('/api/v1/practice/gold/claim', ['request_id' => 'r-1'])->assertStatus(409)->assertJsonPath('error', 'not_eligible');
    expect(balance($rich, Currency::GD))->toBe(5_000_00);

    $me = gwPlayer(1_000);
    gwBust($this, $me);
    expect(balance($me, Currency::GD))->toBe(0); // nothing is credited until Claim is pressed
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/gold/claim', [])->assertStatus(422)->assertJsonValidationErrors('request_id');

    $first = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/gold/claim', ['request_id' => 'popup-1'])->assertCreated()
        ->assertJsonPath('data.gold', '1000.00')->assertJsonPath('data.out_of_gold', false)->assertJsonPath('data.can_claim', false);

    // Double click, refresh, duplicate request (same popup): the same claim, never a second credit.
    foreach (range(1, 3) as $_) {
        $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/gold/claim', ['request_id' => 'popup-1'])->assertOk()
            ->assertJsonPath('data.reference', $first->json('data.reference'))->assertJsonPath('data.gold', '1000.00');
    }
    // A new popup while Gold is back is refused.
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/gold/claim', ['request_id' => 'popup-2'])->assertStatus(409);

    expect(balance($me, Currency::GD))->toBe(1_000_00)->and(balance($me, Currency::CH))->toBe(0);
    expect(WalletTransaction::query()->where('type', TransactionType::OutOfGoldReward->value)->count())->toBe(1);
    expect(AuditLog::query()->where('action', 'gold.claimed')->count())->toBe(1);

    // Exactly two wallets, persisted: Gold and Chips.
    $wallets = collect($this->actingAs($me, 'sanctum')->getJson('/api/v1/wallet')->assertOk()->json('data'))->where('type', 'player');
    expect($wallets->pluck('currency')->sort()->values()->all())->toBe(['CH', 'GD', 'KY'])->and($wallets->firstWhere('currency', 'GD')['balance'])->toBe('1000.00');
    expect(app(WalletService::class)->reconcile()['ok'])->toBeTrue();

    // Back in Single Player, and after the next bust the reward can be claimed again (claim #2).
    gwBust($this, $me);
    $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/gold/claim', ['request_id' => 'popup-3'])->assertCreated();
    expect(WalletTransaction::query()->where('type', TransactionType::OutOfGoldReward->value)->count())->toBe(2);
});

test('leaving Single Player mid-round voids the round: both reserves come back in full, exactly once', function () {
    $me = gwPlayer(5_000);
    $match = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => 'beginner'])->json('data.id');
    $deal = $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/matches/{$match}/deal", [])->assertCreated();
    expect(balance($me, Currency::GD))->toBe((5_000 - $deal->json('data.reserved')) * 100);

    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/matches/{$match}/leave")->assertOk()
        ->assertJsonPath('data.status', 'abandoned')->assertJsonPath('data.gold_wallet.total', '5000.00');
    $count = WalletTransaction::query()->count();
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/matches/{$match}/leave")->assertOk();
    expect(WalletTransaction::query()->count())->toBe($count)
        ->and(balance($me, Currency::GD))->toBe(5_000_00)
        ->and(PracticeGame::query()->find($deal->json('data.id'))->status)->toBe('abandoned')
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();

    // Someone else's match: not found.
    $this->actingAs(gwPlayer(0), 'sanctum')->postJson("/api/v1/practice/matches/{$match}/leave")->assertNotFound();
});

test('Gold stays out of Multiplayer and Chips stay out of Single Player', function () {
    $admin = User::factory()->superAdmin()->create();
    $player = gwPlayer(0);

    // No Multiplayer path accepts Gold (or any retired currency).
    $this->actingAs($admin, 'sanctum')->postJson('/api/v1/wallet/allocate', ['recipient_id' => $player->id, 'user_id' => $player->id, 'currency' => 'GD', 'amount' => '100', 'reason' => 'nope nope'])
        ->assertStatus(422)->assertJsonValidationErrors('currency');
    foreach (['GD', 'VC', 'CP', 'GP'] as $currency) {
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/rooms', ['name' => 'Bad room', 'currency' => $currency])
            ->assertStatus(422)->assertJsonValidationErrors('currency');
    }

    // Chips never pay for Single Player: a player with only Chips is Out of Gold.
    fund($player, 50_000_00, Currency::CH);
    $this->actingAs($player, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => 'beginner'])->assertStatus(409)->assertJsonPath('error', 'out_of_gold');
    expect(balance($player, Currency::CH))->toBe(50_000_00);

    // Agents and admins never get Gold allocation or commission wallets.
    app(WalletService::class)->provision($admin);
    expect($admin->wallets()->where('currency', 'GD')->get()->map(fn ($w) => $w->type instanceof BackedEnum ? $w->type->value : $w->type)->unique()->values()->all())->toBe(['player']);
});

test('the wallet reports the Total Amount: spendable Gold plus what is reserved for the open round', function () {
    $me = gwPlayer(5_000);
    gwState($this, $me)->assertJsonPath('data.total', '5000.00')->assertJsonPath('data.reserved', '0.00');

    $match = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => 'beginner'])->json('data.id');
    $deal = $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/matches/{$match}/deal", [])->assertCreated();
    $reserved = $deal->json('data.reserved');

    gwState($this, $me)->assertJsonPath('data.reserved', \App\Support\Points::decimal($reserved * 100))
        ->assertJsonPath('data.gold', \App\Support\Points::decimal((5_000 - $reserved) * 100))
        ->assertJsonPath('data.total', '5000.00');

    $game = PracticeGame::query()->findOrFail($deal->json('data.id'));
    $a = \App\Game\AutoArranger::arrange($game->hands[1]);
    $net = $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/{$game->id}/submit", ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back])->json('data.result.gold');
    gwState($this, $me)->assertJsonPath('data.reserved', '0.00')->assertJsonPath('data.total', \App\Support\Points::decimal((5_000 + $net) * 100));
    expect(balance($me, Currency::GD))->toBe((5_000 + $net) * 100);
});

test('a match in progress stays playable below the tier minimum while Gold covers the next round', function () {
    $me = gwPlayer(1_000);
    $match = $this->actingAs($me, 'sanctum')->postJson('/api/v1/practice/matches', ['tier' => 'beginner'])->json('data.id');
    PracticeMatch::query()->whereKey($match)->update(['rounds_played' => 1]); // round 2: LuckyBot banks
    $wallets = app(WalletService::class);
    app(LedgerService::class)->transfer(new TransferRequest(TransactionType::PlayerDebit, Currency::GD, $wallets->for($me, Currency::GD), null, 400_00, 'test'));

    // 600 Gold: below Beginner's 1,000 to start, but enough for this match's next round.
    $tiers = collect($this->actingAs($me, 'sanctum')->getJson('/api/v1/practice/tiers')->json('data'))->keyBy('key');
    expect($tiers['beginner']['eligible'])->toBeTrue()->and($tiers['intermediate']['eligible'])->toBeFalse();
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/practice/matches/{$match}/deal", ['bet' => 50])->assertCreated();
});
