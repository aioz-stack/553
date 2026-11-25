<?php

use App\Game\Deck;
use App\Models\GameBet;
use App\Models\GameCard;
use App\Models\GameSession;
use App\Models\User;
use App\Services\Game\BankerMatchService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

test('multiplayer deals like Single Player: clockwise from the seat after the banker, with the deal animation added to the arranging time', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $table = lbStart($this, [$owner, ...$others], $room);
    $session = GameSession::query()->findOrFail($table->fresh()->current_session_id);
    foreach ($session->config['participants'] as $userId) {
        if ($userId !== $session->banker_user_id && ! GameBet::query()->where('game_session_id', $session->id)->where('user_id', $userId)->exists()) {
            app(BankerMatchService::class)->placeBet(User::find($userId), $session, $session->config['min_bet']);
        }
    }
    $session->refresh();
    expect($session->status->value)->toBe('ARRANGING');

    $cards = GameCard::query()->where('game_session_id', $session->id)->get();
    $bankerSeat = (int) $cards->firstWhere('user_id', $session->banker_user_id)->seat;
    $expected = Deck::deal(Deck::shuffled($session->server_seed), 4, 13, ($bankerSeat % 4) + 1);
    expect($cards)->toHaveCount(4);
    foreach ($cards as $c) {
        expect($c->cards)->toBe($expected[(int) $c->seat]);
    }
    expect(collect($cards)->flatMap(fn ($c) => $c->cards)->unique()->count())->toBe(52);

    $seconds = (int) $session->config['arrangement_seconds'] + (int) config('pusoy.banker.deal_animation_seconds');
    expect(abs(now()->addSeconds($seconds)->diffInSeconds($session->arrangement_deadline)))->toBeLessThanOrEqual(2);
});
