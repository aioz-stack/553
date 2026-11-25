<?php

use App\Game\Banker\BankerRound;
use App\Game\Deck;
use App\Models\GameBet;
use App\Models\GameCard;
use App\Models\GameResult;
use App\Models\GameSession;
use App\Models\GameSubmission;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

// Card Submission, Misarrangement Penalty & Lucky Hand Rules (Multiplayer; Single Player in PracticeTest).

const CR_STRONG = ['2C', '3D', '4H', 'TC', 'TD', '9H', '8S', '5D', 'AC', 'AD', 'AH', 'KS', 'KD'];

/** A dealt lobby round (bets placed): [banker, players (non-banker), session]. */
function crRound($test): array
{
    [$owner, $room, $others] = lbFull($test, ['min_entry' => 100]);
    $table = lbStart($test, [$owner, ...$others], $room);
    $session = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    $banker = User::find($session->banker_user_id);
    $players = collect([$owner, ...$others])->reject(fn ($u) => $u->id === $banker->id)->values()->all();
    foreach ($players as $p) {
        if (! GameBet::query()->where('game_session_id', $session->id)->where('user_id', $p->id)->exists()) {
            app(BankerMatchService::class)->placeBet($p, $session, $session->config['min_bet']);
        }
    }

    return [$banker, $players, $session->fresh()];
}

/** Give $user the known 13 cards (the others get the rest of the deck, still 52 distinct). */
function crRig(GameSession $session, User $user, array $hand): void
{
    $rest = array_values(array_diff(Deck::ordered(), $hand));
    foreach (GameCard::query()->where('game_session_id', $session->id)->orderBy('seat')->get() as $card) {
        $card->update(['cards' => $card->user_id === $user->id ? $hand : array_splice($rest, 0, 13)]);
    }
}

test('a misarranged hand can be submitted, is kept as it is and pays 2× the bet to the banker; settled once', function () {
    [$banker, $players, $session] = crRound($this);
    $me = $players[0];
    crRig($session, $me, CR_STRONG);
    $bet = (int) GameBet::query()->where('game_session_id', $session->id)->where('user_id', $me->id)->value('amount');

    // Middle stronger than Back: misarranged, accepted.
    $sub = app(GameEngine::class)->submit($me, $session->fresh(), ['2C', '3D', '4H'], ['AC', 'AD', 'AH', 'KS', 'KD'], ['TC', 'TD', '9H', '8S', '5D']);
    expect($sub->is_foul)->toBeTrue()->and($sub->middle)->toBe(['AC', 'AD', 'AH', 'KS', 'KD']);
    // A Lucky declaration after submitting is refused: the hand is locked.
    expect(fn () => app(BankerMatchService::class)->declareLucky($me, $session->fresh(), app(GameEngine::class)))->toThrow(\App\Exceptions\BusinessRuleException::class);

    // The banker arranges properly (and declares nothing).
    $bankerCards = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $banker->id)->value('cards');
    $b = \App\Game\AutoArranger::arrange(is_string($bankerCards) ? json_decode($bankerCards, true) : $bankerCards);
    app(GameEngine::class)->submit($banker, $session->fresh(), $b->front, $b->middle, $b->back);

    $this->travelTo(app(GameEngine::class)->expiresAt($session)->addSecond());
    app(GameEngine::class)->expire($session->fresh());

    $result = GameResult::query()->where('game_session_id', $session->id)->where('user_id', $me->id)->sole();
    $public = collect(app(GameEngine::class)->publicResults($session->fresh()))->keyBy('user_id');
    // vs a properly arranged banker: exactly −2 × bet, shown as the misarrangement penalty.
    expect($result->is_foul)->toBeTrue()
        ->and($result->net_amount)->toBe(-2 * $bet)
        ->and($public[$me->id]['penalty'])->toBe('misarranged');

    // Settling again (retries, reconnects) moves nothing twice.
    $tx = WalletTransaction::query()->where('game_session_id', $session->id)->count();
    app(BankerMatchService::class)->settle($session->fresh());
    app(GameEngine::class)->resolve($session->fresh());
    expect(WalletTransaction::query()->where('game_session_id', $session->id)->count())->toBe($tx)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('at the timeout the saved rows are submitted exactly as they are, even misarranged', function () {
    [, $players, $session] = crRound($this);
    $me = $players[0];
    crRig($session, $me, CR_STRONG);
    $rows = ['front' => ['AC', 'AD', 'AH'], 'middle' => ['2C', '3D', '4H', 'TC', 'TD'], 'back' => ['9H', '8S', '5D', 'KS', 'KD']];
    $this->actingAs($me, 'sanctum')->putJson("/api/v1/games/{$session->id}/draft", $rows)->assertOk();

    $this->travelTo(app(GameEngine::class)->expiresAt($session)->addSecond());
    app(GameEngine::class)->expire($session->fresh());

    $sub = GameSubmission::query()->where('game_session_id', $session->id)->where('user_id', $me->id)->sole();
    expect([$sub->front, $sub->middle, $sub->back])->toBe([$rows['front'], $rows['middle'], $rows['back']])
        ->and($sub->is_foul)->toBeTrue()
        ->and($sub->is_auto)->toBeTrue();
});

test('a false Lucky Hand declaration is accepted with the rows on screen and costs 2× bet', function () {
    [$banker, $players, $session] = crRound($this);
    $me = $players[0];
    crRig($session, $me, CR_STRONG);
    $rows = ['front' => ['AC', 'AD', 'AH'], 'middle' => ['2C', '3D', '4H', 'TC', 'TD'], 'back' => ['9H', '8S', '5D', 'KS', 'KD']];

    $this->actingAs($me, 'sanctum')->postJson("/api/v1/games/{$session->id}/lucky", $rows)->assertCreated()
        ->assertJsonPath('data.my_submission.lucky_failed', true)
        ->assertJsonPath('message', 'No qualifying Lucky Hand — a false declaration costs 2× your bet.');
    $sub = GameSubmission::query()->where('game_session_id', $session->id)->where('user_id', $me->id)->sole();
    // The declaration decides the round: kept as shown, not judged as misarranged too.
    expect($sub->front)->toBe($rows['front'])->and($sub->is_foul)->toBeFalse();

    $bet = (int) GameBet::query()->where('game_session_id', $session->id)->where('user_id', $me->id)->value('amount');
    $this->travelTo(app(GameEngine::class)->expiresAt($session)->addSecond());
    app(GameEngine::class)->expire($session->fresh());
    $result = GameResult::query()->where('game_session_id', $session->id)->where('user_id', $me->id)->sole();
    expect($result->lucky_failed)->toBeTrue()->and($result->net_amount)->toBe(-2 * $bet);
});

test('settlement maths: misarranged = −2× bet, banker misarranged pays 2× each bet, both misarranged cancel out', function () {
    $good = new \App\Game\Arrangement(['2C', '3D', '4H'], ['TC', 'TD', '9H', '8S', '5D'], ['AC', 'AD', 'AH', 'KS', 'KD']);
    $foul = new \App\Game\Arrangement(['2C', '3D', '4H'], ['AC', 'AD', 'AH', 'KS', 'KD'], ['TC', 'TD', '9H', '8S', '5D']);
    $calc = new BankerRound(bankerWinsTies: true);

    $r = $calc->settle(1, [2 => 100, 3 => 50], [1 => $good, 2 => $foul, 3 => $good]);
    expect($r['players'][2]['net'])->toBe(-200)->and($r['players'][2]['is_foul'])->toBeTrue();

    $r = $calc->settle(1, [2 => 100, 3 => 50], [1 => $foul, 2 => $good, 3 => $good]);
    expect($r['players'][2]['net'])->toBe(200)->and($r['players'][3]['net'])->toBe(100)->and($r['banker']['net'])->toBe(-300);

    // Both misarranged: no net transfer, even with banker advantage.
    $r = $calc->settle(1, [2 => 100], [1 => $foul, 2 => $foul]);
    expect($r['players'][2]['net'])->toBe(0)->and($r['banker']['net'])->toBe(0);

    // Lucky: valid +2×, false −2×.
    $r = $calc->settle(1, [2 => 100, 3 => 100], [1 => $good, 2 => $foul, 3 => $good], [], [2 => 'three_straights'], [3 => true]);
    expect($r['players'][2]['net'])->toBe(200)->and($r['players'][3]['net'])->toBe(-200);
});

test('6 Pairs: declared, validated on the dealt cards, paid 2× bet once and recorded in the history', function () {
    [, $players, $session] = crRound($this);
    $me = $players[0];
    crRig($session, $me, ['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'KS', 'AC']);
    $bet = (int) GameBet::query()->where('game_session_id', $session->id)->where('user_id', $me->id)->value('amount');

    $this->actingAs($me, 'sanctum')->getJson("/api/v1/games/{$session->id}")->assertOk()->assertJsonPath('data.my_lucky.type', 'six_pairs');
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/games/{$session->id}/lucky")->assertCreated()
        ->assertJsonPath('message', '6 PAIRS – LUCKY HAND!')
        ->assertJsonPath('data.my_submission.lucky_type', 'six_pairs')
        ->assertJsonPath('data.my_submission.lucky_failed', false);
    // No second claim.
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/games/{$session->id}/lucky")->assertStatus(409);

    $this->travelTo(app(GameEngine::class)->expiresAt($session)->addSecond());
    app(GameEngine::class)->expire($session->fresh());
    app(BankerMatchService::class)->settle($session->fresh()); // a retry pays nothing twice

    $result = GameResult::query()->where('game_session_id', $session->id)->where('user_id', $me->id)->sole();
    expect($result->lucky_type)->toBe('six_pairs')->and($result->lucky_failed)->toBeFalse()->and($result->net_amount)->toBe(2 * $bet);
    $tx = WalletTransaction::query()->where('game_session_id', $session->id)->where('type', \App\Enums\TransactionType::LuckyBonus->value)->get();
    expect($tx)->toHaveCount(1)->and($tx[0]->reason)->toContain('6 Pairs');
});

test('no queue worker: once the time is up, the players\' own polling submits the rows as they are and finishes the round', function () {
    \Illuminate\Support\Facades\Queue::fake(); // nothing queued ever runs (no worker, no scheduler)
    [$banker, $players, $session] = crRound($this);
    expect($session->status->value)->toBe('ARRANGING');
    $me = $players[0];
    $table = $session->table;

    // Just past the deadline (within the grace): not yet expired.
    $this->travelTo($session->arrangement_deadline->addSecond());
    $this->actingAs($me, 'sanctum')->getJson("/api/v1/tables/{$table->id}")->assertOk();
    expect($session->fresh()->status->value)->toBe('ARRANGING');

    // After the grace: the next look at the table (or a heartbeat) submits and resolves.
    $this->travelTo(app(GameEngine::class)->expiresAt($session->fresh())->addSecond());
    $this->actingAs($me, 'sanctum')->postJson("/api/v1/tables/{$table->id}/heartbeat")->assertOk();
    expect($session->fresh()->status->value)->toBe('COMPLETED')
        ->and(GameSubmission::query()->where('game_session_id', $session->id)->count())->toBe(4)
        ->and(GameResult::query()->where('game_session_id', $session->id)->count())->toBe(4);
});

test('a SUBMIT tapped as the timer shows 0 still counts (grace); after the grace it is refused and the saved rows go in', function () {
    \Illuminate\Support\Facades\Queue::fake();
    [, $players, $session] = crRound($this);
    [$a, $b] = $players;
    crRig($session, $a, CR_STRONG);
    $rows = ['front' => ['2C', '3D', '4H'], 'middle' => ['TC', 'TD', '9H', '8S', '5D'], 'back' => ['AC', 'AD', 'AH', 'KS', 'KD']];

    $this->travelTo($session->arrangement_deadline->addSecond());
    $this->actingAs($a, 'sanctum')->postJson("/api/v1/games/{$session->id}/submit", $rows)->assertSuccessful();
    expect(GameSubmission::query()->where('game_session_id', $session->id)->where('user_id', $a->id)->value('is_auto'))->toBeFalse();

    $this->travelTo(app(GameEngine::class)->expiresAt($session->fresh())->addSecond());
    $bCards = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $b->id)->first()->cards;
    $this->actingAs($b, 'sanctum')->postJson("/api/v1/games/{$session->id}/submit", ['front' => array_slice($bCards, 0, 3), 'middle' => array_slice($bCards, 3, 5), 'back' => array_slice($bCards, 8, 5)])
        ->assertStatus(409)->assertJsonPath('error', 'timer_expired');
    $this->actingAs($b, 'sanctum')->getJson("/api/v1/games/{$session->id}")->assertOk()->assertJsonPath('data.status', 'COMPLETED');
});
