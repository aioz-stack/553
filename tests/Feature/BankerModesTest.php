<?php

use App\Enums\Currency;
use App\Enums\GameMode;
use App\Enums\GameStatus;
use App\Enums\TableStatus;
use App\Enums\TransactionType;
use App\Exceptions\BusinessRuleException;
use App\Game\AutoArranger;
use App\Game\Deck;
use App\Models\GameBet;
use App\Models\GameCard;
use App\Models\GameResult;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use App\Services\Game\GameStatePresenter;
use App\Services\Game\TableService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->tables = app(TableService::class);
    $this->match = app(BankerMatchService::class);
    $this->engine = app(GameEngine::class);
});

function bankerRoom(GameMode $mode, array $overrides = []): GameRoom
{
    return GameRoom::factory()->create($overrides + [
        'game_mode' => $mode,
        'rounds_total' => 12,
        'entry_amount' => 1_000,   // min bet 10.00
        'max_bet' => 5_000,        // max bet 50.00
        'platform_fee_bps' => 0,
        'min_players' => 2,
        'betting_seconds' => 15,
    ]);
}

/**
 * Seat funded players and ready them all, which starts the match.
 *
 * @return array{0: GameTable, 1: list<User>}
 */
function startMatch(GameRoom $room, int $count = 3, array $funding = []): array
{
    $tables = app(TableService::class);
    $players = [];

    foreach (range(1, $count) as $i) {
        $player = User::factory()->player()->create();
        fund($player, $funding[$i - 1] ?? 100_000);
        $seat = $tables->join($player, $room);
        $players[] = $player;
    }

    foreach ($players as $player) {
        $tables->setReady($player, $seat->table->fresh(), true);
    }

    return [$seat->table->fresh(), $players];
}

function currentRound(GameTable $table): GameSession
{
    return GameSession::query()->findOrFail($table->fresh()->current_session_id);
}

/**
 * Everyone bets the minimum, then every dealt hand is auto-arranged and submitted.
 */
function playRound(GameTable $table, int $bet = 1_000): GameSession
{
    $session = currentRound($table);
    $match = app(BankerMatchService::class);

    foreach ($session->config['participants'] as $userId) {
        if (! GameBet::query()->where('game_session_id', $session->id)->where('user_id', $userId)->exists()) {
            $match->placeBet(User::find($userId), $session, $bet);
        }
    }

    foreach (GameCard::query()->where('game_session_id', $session->id)->get() as $card) {
        if (! $session->submissions()->where('user_id', $card->user_id)->exists()) {
            $a = AutoArranger::arrange($card->cards);
            app(GameEngine::class)->submit(User::find($card->user_id), $session->fresh(), $a->front, $a->middle, $a->back);
        }
    }

    return $session->fresh();
}

function nextRound(GameTable $table): ?GameSession
{
    test()->travel(10)->seconds();

    return app(BankerMatchService::class)->startRound($table->fresh());
}

function totalVc(): int
{
    return (int) DB::table('wallets')->where('currency', 'CH')->sum('balance');
}

test('round bank: banker rotates by seat each round, 12 rounds, money is conserved', function () {
    $room = bankerRoom(GameMode::RoundBank);
    [$table, $players] = startMatch($room, 3);
    $before = totalVc();

    expect($table->status)->toBe(TableStatus::InGame)
        ->and(currentRound($table)->status)->toBe(GameStatus::Betting)
        ->and(currentRound($table)->round_number)->toBe(1);

    $bankers = [];

    for ($round = 1; $round <= 12; $round++) {
        $session = playRound($table);
        $bankers[] = $session->banker_user_id;

        expect($session->status)->toBe(GameStatus::Completed)
            ->and($session->round_number)->toBe($round)
            ->and(GameResult::query()->where('game_session_id', $session->id)->count())->toBe(3)
            // Zero-sum per round (no fee in this room).
            ->and((int) GameResult::query()->where('game_session_id', $session->id)->sum('net_amount'))->toBe(0)
            // Every reserve for the round has been paid back out of escrow.
            ->and(app(WalletService::class)->escrow(Currency::CH)->fresh()->balance)->toBe(0);

        if ($round < 12) {
            nextRound($table);
        }
    }

    $seatOrder = collect($players)->pluck('id')->all();

    expect($bankers)->toBe(array_merge($seatOrder, $seatOrder, $seatOrder, $seatOrder))
        ->and($table->fresh()->status)->toBe(TableStatus::Closed)
        ->and($table->fresh()->end_reason)->toBe('completed')
        ->and($table->fresh()->rounds_played)->toBe(12)
        ->and(app(WalletService::class)->escrow(Currency::CH)->fresh()->balance)->toBe(0)
        ->and(totalVc())->toBe($before)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();

    $standings = $this->match->standings($table->fresh());
    expect(collect($standings)->sum('rounds'))->toBe(36)
        ->and(collect($standings)->pluck('banker_rounds')->all())->each->toBe(4);
});

test('banker mode: the creator banks every round; leaving hands it to the highest balance', function () {
    $room = bankerRoom(GameMode::Banker);
    [$table, $players] = startMatch($room, 3, [100_000, 40_000, 90_000]);
    [$creator, $poorer, $richer] = $players;

    $session = playRound($table);
    expect($session->banker_user_id)->toBe($creator->id);

    nextRound($table);
    $session = playRound($table);
    expect($session->banker_user_id)->toBe($creator->id);

    // Between rounds the banker leaves; the next round goes to the richest eligible player.
    $this->tables->leave($creator, $table->fresh());
    $next = nextRound($table);

    expect($next->banker_user_id)->toBe($richer->id)
        ->and(GameResult::query()->where('user_id', $creator->id)->count())->toBe(2); // earlier rounds untouched
});

test('bets are validated server side', function () {
    $room = bankerRoom(GameMode::Banker);
    // The banker holds exactly the banker reserve: 6 × the 50.00 maximum bet = 300.00.
    [$table, [$banker, $p1, $p2]] = startMatch($room, 3, [30_000, 100_000, 100_000]);
    $session = currentRound($table);

    expect(fn () => $this->match->placeBet($banker, $session, 1_000))->toThrow(BusinessRuleException::class, 'banker');
    expect(fn () => $this->match->placeBet($p1, $session, 999))->toThrow(BusinessRuleException::class, 'Bet must be between');
    expect(fn () => $this->match->placeBet($p1, $session, 5_001))->toThrow(BusinessRuleException::class, 'Bet must be between');

    expect($session->banker_user_id)->toBe($banker->id);
    // Covering a 50.00 bet reserves 100.00 of the banker's 300.00.
    $this->match->placeBet($p1, $session, 5_000);
    expect(fn () => $this->match->placeBet($p1, $session, 1_000))->toThrow(BusinessRuleException::class, 'already placed');

    // The 6× banker reserve always covers the other players' biggest bets.
    $this->match->placeBet($p2, $session, 5_000);

    expect(balance($banker))->toBe(30_000 - 10_000 - 10_000)
        ->and(balance($p1))->toBe(100_000 - 10_000)
        ->and($session->fresh()->status)->toBe(GameStatus::Arranging) // everyone bet → dealt
        ->and(GameCard::query()->where('game_session_id', $session->id)->count())->toBe(3);
});

test('closing betting auto-bets the minimum for connected players and sits out the offline', function () {
    $room = bankerRoom(GameMode::RoundBank);
    [$table, [$a, $b, $c]] = startMatch($room, 3);
    $session = currentRound($table);
    $offline = collect([$b, $c])->first(fn (User $u) => $u->id !== $session->banker_user_id && in_array($u->id, $session->config['participants'], true));

    DB::table('game_players')->where('game_table_id', $table->id)->where('user_id', $offline->id)->update(['is_connected' => false]);
    $this->travel(20)->seconds();
    $this->match->closeBetting($session);

    $bets = GameBet::query()->where('game_session_id', $session->id)->get();

    expect($session->fresh()->status)->toBe(GameStatus::Arranging)
        ->and($bets)->toHaveCount(1)
        ->and($bets->first()->is_auto)->toBeTrue()
        ->and($bets->first()->amount)->toBe(1_000)
        ->and(GameCard::query()->where('game_session_id', $session->id)->where('user_id', $offline->id)->exists())->toBeFalse();
});

test('lucky hand: validated against the dealt cards and paid 2x as a lucky bonus', function () {
    $room = bankerRoom(GameMode::Banker);
    [$table, [$banker, $p1, $p2]] = startMatch($room, 3);
    $session = currentRound($table);
    $this->match->placeBet($p1, $session, 2_000);
    $this->match->placeBet($p2, $session, 1_000);

    // Fake a lucky deal for p1 (six pairs), keeping the 52-card deck unique within the round.
    $lucky = ['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'KS', 'AC'];
    $cards = GameCard::query()->where('game_session_id', $session->id)->get()->keyBy('user_id');
    $others = array_values(array_diff(Deck::ordered(), $lucky));
    $cards[$p1->id]->update(['cards' => $lucky]);
    $cards[$banker->id]->update(['cards' => array_slice($others, 0, 13)]);
    $cards[$p2->id]->update(['cards' => array_slice($others, 13, 13)]);

    expect(fn () => $this->match->declareLucky($p2, $session->fresh(), $this->engine))->toThrow(BusinessRuleException::class, 'do not form');

    $state = app(GameStatePresenter::class)->session($session->fresh(), $p1);
    expect($state['my_lucky']['type'])->toBe('six_pairs');

    $this->match->declareLucky($p1, $session->fresh(), $this->engine);

    // The declaration locks the hand: no later submission, no second declaration.
    $a = AutoArranger::arrange($lucky);
    expect(fn () => $this->engine->submit($p1, $session->fresh(), $a->front, $a->middle, $a->back))->toThrow(BusinessRuleException::class, 'already submitted');

    // Other players see the declaration but not the cards before the reveal.
    $theirView = app(GameStatePresenter::class)->session($session->fresh(), $p2);
    expect(collect($theirView['players'])->firstWhere('user_id', $p1->id)['declared_lucky'])->toBeTrue()
        ->and($theirView['arrangements'])->toBeNull();

    playRound($table);
    $result = GameResult::query()->where('game_session_id', $session->id)->where('user_id', $p1->id)->first();

    expect($result->lucky_type)->toBe('six_pairs')
        ->and($result->net_amount)->toBe(4_000)
        ->and($result->lucky_bonus)->toBe(4_000)
        ->and((int) WalletTransaction::query()->where('type', TransactionType::LuckyBonus->value)->where('game_session_id', $session->id)->sum('amount'))->toBe(4_000 + 4_000);
});

test('you cannot leave mid-round but can leave between rounds', function () {
    $room = bankerRoom(GameMode::RoundBank);
    [$table, $players] = startMatch($room, 3);
    $session = currentRound($table);
    $bettor = User::find($session->config['participants'][0]);
    $this->match->placeBet($bettor, $session, 1_000);

    expect(fn () => $this->tables->leave($bettor, $table->fresh()))->toThrow(BusinessRuleException::class, 'Finish this round');

    playRound($table);
    $this->tables->leave($bettor, $table->fresh());

    expect($table->fresh()->players()->where('user_id', $bettor->id)->exists())->toBeFalse()
        ->and($table->fresh()->status)->toBe(TableStatus::InGame); // two players remain
});

test('the match ends when fewer than two players remain', function () {
    $room = bankerRoom(GameMode::RoundBank);
    [$table, [$a, $b]] = startMatch($room, 2);
    playRound($table);

    $this->tables->leave($a, $table->fresh());

    expect($table->fresh()->status)->toBe(TableStatus::Closed)
        ->and($table->fresh()->end_reason)->toBe('not_enough_players');
});

test('late joiners are dealt in from the next round', function () {
    $room = bankerRoom(GameMode::RoundBank);
    [$table, $players] = startMatch($room, 2);
    $late = User::factory()->player()->create();
    fund($late, 100_000);
    $seat = $this->tables->join($late, $room);

    expect($seat->game_table_id)->toBe($table->id);

    $session = currentRound($table);
    expect(fn () => $this->match->placeBet($late, $session, 1_000))->toThrow(BusinessRuleException::class, 'next round');

    playRound($table);
    $next = nextRound($table);

    expect(in_array($late->id, [...$next->config['participants'], $next->banker_user_id], true))->toBeTrue();
});

test('cards stay private before the reveal and balances are never in the table state', function () {
    $room = bankerRoom(GameMode::Banker);
    [$table, [$banker, $p1, $p2]] = startMatch($room, 3);
    $session = currentRound($table);
    $this->match->placeBet($p1, $session, 1_000);
    $this->match->placeBet($p2, $session, 1_000);

    $view = app(GameStatePresenter::class)->session($session->fresh(), $p1);
    $json = json_encode($view + ['table' => app(GameStatePresenter::class)->table($table->fresh(), $p1)]);
    $bankerCards = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $banker->id)->value('cards');

    expect($view['my_cards'])->toHaveCount(13)
        ->and($view['arrangements'])->toBeNull()
        ->and(str_contains($json, '"balance"'))->toBeFalse()
        ->and(array_intersect($bankerCards, $view['my_cards']))->toBe([]);

    foreach ($bankerCards as $card) {
        expect(str_contains($json, '"'.$card.'"') && ! in_array($card, $view['my_cards'], true))->toBeFalse();
    }
});

test('a cancelled round refunds both sides and ends the match', function () {
    $room = bankerRoom(GameMode::Banker);
    [$table, [$banker, $p1, $p2]] = startMatch($room, 3);
    $session = currentRound($table);
    $this->match->placeBet($p1, $session, 3_000);

    $this->engine->cancel($session->fresh(), null, 'test');

    expect(balance($banker))->toBe(100_000)
        ->and(balance($p1))->toBe(100_000)
        ->and($table->fresh()->status)->toBe(TableStatus::Closed)
        ->and($table->fresh()->end_reason)->toBe('cancelled');
});

test('API: host a banker table, bet, and read round stats', function () {
    $host = User::factory()->player()->create();
    fund($host, 100_000);
    $guest = User::factory()->player()->create();
    fund($guest, 100_000);

    $this->actingAs($host, 'sanctum')->postJson('/api/v1/rooms/host', [
        'name' => 'Friday banker', 'game_mode' => 'banker', 'min_bet' => '10', 'max_bet' => '40',
    ])->assertCreated()->assertJsonPath('data.creator_user_id', $host->id)->assertJsonPath('data.game_mode', 'banker');

    $room = GameRoom::query()->where('owner_id', $host->id)->firstOrFail();
    $tableId = $this->actingAs($guest, 'sanctum')->postJson("/api/v1/rooms/{$room->id}/join")->assertCreated()->json('data.id');

    $this->actingAs($host, 'sanctum')->postJson("/api/v1/tables/{$tableId}/ready", ['ready' => true])->assertOk();
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/tables/{$tableId}/ready", ['ready' => true])
        ->assertOk()->assertJsonPath('data.session.status', 'BETTING')->assertJsonPath('data.session.banker_user_id', $host->id)
        ->assertJsonPath('data.session.can_bet', true);

    $sessionId = GameTable::find($tableId)->current_session_id;

    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/games/{$sessionId}/bet", ['amount' => '41'])->assertStatus(422);
    $this->actingAs($host, 'sanctum')->postJson("/api/v1/games/{$sessionId}/bet", ['amount' => '10'])->assertStatus(409);
    $this->actingAs($guest, 'sanctum')->postJson("/api/v1/games/{$sessionId}/bet", ['amount' => '20'])
        ->assertCreated()->assertJsonPath('data.status', 'ARRANGING')->assertJsonPath('data.my_bet', '20.00');

    playRound(GameTable::find($tableId));

    $this->actingAs($guest, 'sanctum')->getJson('/api/v1/profile/stats')
        ->assertOk()->assertJsonPath('data.rounds.played', 1)->assertJsonPath('data.rounds.total_bets', '20.00');
    $this->actingAs($host, 'sanctum')->getJson('/api/v1/profile/stats')
        ->assertOk()->assertJsonPath('data.banker.rounds', 1)->assertJsonPath('data.banker.bets_received', '20.00')
        ->assertJsonPath('data.banker.remaining_rounds', 11);
    $this->actingAs($host, 'sanctum')->getJson('/api/v1/wallet/transactions?role=banker')
        ->assertOk()->assertJsonPath('data.0.game_role', 'banker');
});
