<?php

use App\Enums\Currency;
use App\Enums\GameStatus;
use App\Enums\TableStatus;
use App\Events\Game\GameEvents;
use App\Events\Game\TableEvent;
use App\Events\Game\UserEvent;
use App\Exceptions\BusinessRuleException;
use App\Game\AutoArranger;
use App\Game\Deck;
use App\Models\AgentCommission;
use App\Models\GameCard;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\User;
use App\Services\Game\GameEngine;
use App\Services\Game\GameStatePresenter;
use App\Services\Game\TableService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->tables = app(TableService::class);
    $this->engine = app(GameEngine::class);
});

function submitAuto(GameSession $session, User $player): void
{
    $cards = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $player->id)->value('cards');
    $a = AutoArranger::arrange($cards);
    app(GameEngine::class)->submit($player, $session, $a->front, $a->middle, $a->back);
}

test('a table seats exactly four and a fifth player opens a new table', function () {
    $room = GameRoom::factory()->create();
    $seats = [];

    foreach (range(1, 5) as $i) {
        $player = User::factory()->create();
        fund($player, $room->entry_amount);
        $seats[] = $this->tables->join($player, $room);
    }

    expect(collect($seats)->take(4)->pluck('game_table_id')->unique())->toHaveCount(1)
        ->and($seats[4]->game_table_id)->not->toBe($seats[0]->game_table_id)
        ->and(collect($seats)->take(4)->pluck('seat')->sort()->values()->all())->toBe([1, 2, 3, 4])
        ->and($seats[0]->table->fresh()->status)->toBe(TableStatus::Ready);
});

test('joining reserves the entry in escrow and leaving refunds it', function () {
    $room = GameRoom::factory()->create();
    $player = User::factory()->create();
    fund($player, 10_000);

    $seat = $this->tables->join($player, $room);
    expect(balance($player))->toBe(10_000 - $room->entry_amount)
        ->and(app(WalletService::class)->escrow(Currency::CH)->balance)->toBe($room->entry_amount);

    $this->tables->leave($player, $seat->table);
    expect(balance($player))->toBe(10_000)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('duplicate joins are idempotent and seating elsewhere is refused', function () {
    $room = GameRoom::factory()->create();
    $other = GameRoom::factory()->create();
    $player = User::factory()->create();
    fund($player, 50_000);

    $first = $this->tables->join($player, $room);
    $second = $this->tables->join($player, $room);

    expect($second->id)->toBe($first->id)
        ->and(balance($player))->toBe(50_000 - $room->entry_amount);

    expect(fn () => $this->tables->join($player, $other))->toThrow(BusinessRuleException::class, 'already seated');
});

test('players without enough balance cannot join', function () {
    $room = GameRoom::factory()->create();
    $player = User::factory()->create();
    fund($player, $room->entry_amount - 1);

    expect(fn () => $this->tables->join($player, $room))->toThrow(BusinessRuleException::class, 'Insufficient');
});

test('Gold is never accepted in Multiplayer: a player holding only Gold cannot enter a room', function () {
    $room = GameRoom::factory()->create();
    $player = User::factory()->create();
    fund($player, 100_000_00, Currency::GD);

    expect(fn () => $this->tables->join($player, $room))->toThrow(BusinessRuleException::class, 'Insufficient');
    expect(balance($player, Currency::GD))->toBe(100_000_00);
});

test('the game starts when four players are ready and each sees only their own cards', function () {
    Event::fake([TableEvent::class, UserEvent::class]);

    [$table, $session, $players] = startGame();

    expect($session)->not->toBeNull()
        ->and($session->status)->toBe(GameStatus::Arranging)
        ->and($table->status)->toBe(TableStatus::InGame)
        ->and($session->cards)->toHaveCount(4);

    $presenter = app(GameStatePresenter::class);
    $state = $presenter->session($session, $players[0]);
    $mine = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $players[0]->id)->value('cards');

    expect($state['my_cards'])->toBe($mine)
        ->and($state['arrangements'])->toBeNull()
        ->and($state['server_seed'])->toBeNull()
        ->and(json_encode($state))->not->toContain(json_encode(GameCard::query()->where('user_id', $players[1]->id)->value('cards')));

    // Card dealing goes privately to each player's own channel.
    Event::assertDispatched(UserEvent::class, fn (UserEvent $e) => $e->name === GameEvents::CARDS_DEALT && $e->userId === $players[0]->id && $e->payload['cards'] === $mine);
    Event::assertDispatched(TableEvent::class, fn (TableEvent $e) => $e->name === GameEvents::GAME_STARTED && ! isset($e->payload['cards']));
    Event::assertDispatched(TableEvent::class, fn (TableEvent $e) => $e->name === GameEvents::TABLE_FULL);
});

test('a full game resolves, settles, and stays zero-sum and balanced', function () {
    [, $session, $players] = startGame();

    foreach ($players as $player) {
        submitAuto($session, $player);
    }

    $session->refresh();
    expect($session->status)->toBe(GameStatus::Completed)
        ->and($session->seed_revealed)->toBeTrue()
        ->and($session->results)->toHaveCount(4)
        ->and($session->results->sum('score'))->toBe(0)
        ->and($session->handResults)->toHaveCount(36)
        ->and(Deck::verify($session->server_seed, $session->deck_commitment))->toBeTrue();

    $settlement = $session->settlement;
    expect($settlement->status->value)->toBe('settled')
        ->and($settlement->payout_total + $settlement->platform_fee + $settlement->carry_out)->toBe($session->pot);

    expect(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('duplicate submissions are rejected', function () {
    [, $session, $players] = startGame();
    submitAuto($session, $players[0]);

    expect(fn () => submitAuto($session, $players[0]))->toThrow(BusinessRuleException::class, 'already submitted');
});

test('submissions with foreign cards are rejected; a misarranged hand is accepted as it is and marked', function () {
    [, $session, $players] = startGame();
    $cards = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $players[0]->id)->value('cards');
    $foreign = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $players[1]->id)->value('cards');

    expect(fn () => $this->engine->submit($players[0], $session, array_slice($foreign, 0, 3), array_slice($cards, 3, 5), array_slice($cards, 8, 5)))
        ->toThrow(BusinessRuleException::class, 'exactly the cards');

    // Give the player a known hand, then submit it with Middle stronger than Back.
    $known = ['2C', '3D', '4H', 'TC', 'TD', '9H', '8S', '5D', 'AC', 'AD', 'AH', 'KS', 'KD'];
    GameCard::query()->where('game_session_id', $session->id)->where('user_id', $players[0]->id)->update(['cards' => json_encode($known)]);

    $sub = $this->engine->submit($players[0], $session, ['2C', '3D', '4H'], ['AC', 'AD', 'AH', 'KS', 'KD'], ['TC', 'TD', '9H', '8S', '5D']);
    expect($sub->is_foul)->toBeTrue()
        // kept exactly as submitted, never corrected
        ->and($sub->middle)->toBe(['AC', 'AD', 'AH', 'KS', 'KD'])->and($sub->back)->toBe(['TC', 'TD', '9H', '8S', '5D']);

    // Locked: no second submission.
    expect(fn () => $this->engine->submit($players[0], $session, ['2C', '3D', '4H'], ['TC', 'TD', '9H', '8S', '5D'], ['AC', 'AD', 'AH', 'KS', 'KD']))
        ->toThrow(BusinessRuleException::class, 'already submitted');
});

test('non-participants cannot submit', function () {
    [, $session] = startGame();
    $stranger = User::factory()->create();

    expect(fn () => $this->engine->submit($stranger, $session, [], [], []))->toThrow(BusinessRuleException::class, 'not playing');
});

test('timer expiry auto-arranges missing hands and completes the game', function () {
    [, $session, $players] = startGame();
    submitAuto($session, $players[0]);

    $this->travel(91 + (int) config('pusoy.game.submit_grace_seconds'))->seconds(); // past the timer and its grace
    $this->engine->expire($session);

    $session->refresh();
    expect($session->status)->toBe(GameStatus::Completed)
        ->and($session->submissions()->where('is_auto', true)->count())->toBe(3);
});

test('at the timeout a hand nobody touched is submitted exactly as dealt (never auto-arranged); misarranged = marked', function () {
    [, $session, $players] = startGame();
    submitAuto($session, $players[0]);

    $this->travel(91 + (int) config('pusoy.game.submit_grace_seconds'))->seconds(); // past the timer and its grace
    $this->engine->expire($session);

    foreach (array_slice($players, 1) as $p) {
        $cards = GameCard::query()->where('game_session_id', $session->id)->where('user_id', $p->id)->value('cards');
        $cards = is_string($cards) ? json_decode($cards, true) : $cards;
        $sub = \App\Models\GameSubmission::query()->where('game_session_id', $session->id)->where('user_id', $p->id)->sole();
        $asDealt = GameEngine::asDealt($cards);
        expect([$sub->front, $sub->middle, $sub->back])->toBe([array_slice($cards, 0, 3), array_slice($cards, 3, 5), array_slice($cards, 8, 5)])
            ->and($sub->is_auto)->toBeTrue()
            ->and($sub->is_foul)->toBe($asDealt->isFoul());
    }
});

test('submitting after the timer expired is refused', function () {
    [, $session, $players] = startGame();
    $this->travel(91 + (int) config('pusoy.game.submit_grace_seconds'))->seconds(); // past the timer and its grace

    expect(fn () => submitAuto($session, $players[0]))->toThrow(BusinessRuleException::class, 'expired');
});

test('players cannot leave mid-game', function () {
    [$table, , $players] = startGame();

    expect(fn () => $this->tables->leave($players[0], $table))->toThrow(BusinessRuleException::class, 'started');
});

test('disconnection and reconnection are detected and broadcast', function () {
    Event::fake([TableEvent::class]);
    [$table, , $players] = startGame();

    $this->travel(31)->seconds();
    $this->tables->sweep();

    expect($table->players()->where('is_connected', false)->count())->toBe(4);
    Event::assertDispatched(TableEvent::class, fn (TableEvent $e) => $e->name === GameEvents::PLAYER_DISCONNECTED);

    $this->tables->heartbeat($players[0], $table);
    Event::assertDispatched(TableEvent::class, fn (TableEvent $e) => $e->name === GameEvents::PLAYER_RECONNECTED && $e->payload['user_id'] === $players[0]->id);
});

test('state recovery returns the same private state after reconnecting', function () {
    [$table, $session, $players] = startGame();
    submitAuto($session, $players[0]);

    $presenter = app(GameStatePresenter::class);
    $state = $presenter->session($session->fresh(), $players[0]);

    expect($state['my_submission'])->not->toBeNull()
        ->and(collect($state['players'])->firstWhere('user_id', $players[0]->id)['has_submitted'])->toBeTrue()
        ->and(collect($state['players'])->firstWhere('user_id', $players[1]->id)['has_submitted'])->toBeFalse()
        ->and($this->tables->activeSeat($players[0])->game_table_id)->toBe($table->id);
});

test('cancelling a game refunds every entry and creates no commissions', function () {
    [, $session, $players] = startGame();
    $before = balance($players[0]);

    $this->engine->cancel($session, superAdmin(), 'Server maintenance');

    expect($session->fresh()->status)->toBe(GameStatus::Cancelled)
        ->and(balance($players[0]))->toBe($before + $session->config['entry_amount'])
        ->and(AgentCommission::query()->count())->toBe(0)
        ->and(app(WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('a failed settlement leaves the game in scoring and can be retried', function () {
    [, $session, $players] = startGame();

    // Simulate an interrupted settlement: break the escrow balance temporarily.
    $escrow = app(WalletService::class)->escrow(Currency::CH);
    DB::table('wallets')->where('id', $escrow->id)->update(['balance' => 0]);

    foreach ($players as $player) {
        try {
            submitAuto($session, $player);
        } catch (Throwable) {
            // The last submit triggers resolution (sync queue) which fails.
        }
    }

    expect($session->fresh()->status)->toBe(GameStatus::Scoring)
        ->and($session->settlement->status->value)->toBe('failed');

    DB::table('wallets')->where('id', $escrow->id)->update(['balance' => $session->pot]);
    $this->engine->resolve($session->fresh());

    expect($session->fresh()->status)->toBe(GameStatus::Completed)
        ->and($session->fresh()->settlement->status->value)->toBe('settled');
});

test('room config changes never alter a running game', function () {
    $room = GameRoom::factory()->create(['platform_fee_bps' => 1000]);
    [, $session] = startGame($room);

    $room->update(['platform_fee_bps' => 0, 'payout_mode' => 'round_bank']);

    expect($session->fresh()->config['platform_fee_bps'])->toBe(1000)
        ->and($session->fresh()->config['payout_mode'])->toBe('winner_takes_all');
});
