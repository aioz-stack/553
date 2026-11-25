<?php

use App\Enums\Currency;
use App\Enums\TableStatus;
use App\Enums\TransactionType;
use App\Models\GamePlayer;
use App\Models\GameRoom;
use App\Models\GameTable;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Game\BankerMatchService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/*
| Entry tiers: 100 Chips → bets 5/10/15, 1 Key · 500 → 20/30/40, 2 Keys · 1,000 → 50/75/100, 5 Keys.
| Chips ≥ the tier AND ≥ 2× the selected bet; Keys paid once, when the game starts.
*/

function leKeys(User $u): int
{
    return (int) app(\App\Services\Wallet\WalletService::class)->for($u, Currency::KY)->fresh()->balance;
}

test('each tier has exactly its bets and Keys fee; other tiers and bets are refused by the API', function () {
    foreach ([100 => [['5.00', '10.00', '15.00'], 1], 500 => [['20.00', '30.00', '40.00'], 2], 1000 => [['50.00', '75.00', '100.00'], 5]] as $entry => [$bets, $keys]) {
        lbCreate($this, lbPlayer(), ['min_entry' => $entry, 'name' => "Tier {$entry}"])->assertCreated()
            ->assertJsonPath('data.min_entry', $entry)->assertJsonPath('data.bet_chips', $bets)->assertJsonPath('data.key_fee', $keys)
            ->assertJsonPath('data.game_mode', 'round_bank')->assertJsonPath('data.my_bet', $bets[0]);
    }
    $this->actingAs(lbPlayer(), 'sanctum')->getJson('/api/v1/lobbies')->assertJsonPath('meta.tiers', [
        ['min_entry' => 100, 'bets' => [5, 10, 15], 'keys' => 1],
        ['min_entry' => 500, 'bets' => [20, 30, 40], 'keys' => 2],
        ['min_entry' => 1000, 'bets' => [50, 75, 100], 'keys' => 5],
    ]);

    // The creator picks no bet (a sent one is ignored): bets are chosen in the game each round.
    $id = lbCreate($this, lbPlayer(), ['min_entry' => 500, 'bet' => '40'])->assertCreated()->assertJsonPath('data.my_bet', '20.00')->json('data.id');
    // A bet from another tier is refused on join.
    $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['bet' => '50'])->assertStatus(422)->assertJsonPath('error', 'invalid_bet');
    $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['bet' => 'abc'])->assertStatus(422)->assertJsonValidationErrors('bet');
    expect(GameRoom::query()->lobby()->count())->toBe(4);
});

test('joining needs Chips ≥ the tier and ≥ 2× the selected bet, and the Keys fee; clear messages', function () {
    $id = lbCreate($this, lbPlayer(), ['min_entry' => 500])->json('data.id');

    // 500 Chips covers the tier and 2× any of 20/30/40 — but not without Keys.
    $this->actingAs(lbPlayer(499), 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['bet' => '20'])->assertStatus(422)
        ->assertJsonPath('error', 'insufficient_balance')->assertJsonPath('message', fn ($m) => str_contains($m, '500.00 Chips'));
    $this->actingAs(lbPlayer(500, keys: 1), 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['bet' => '20'])->assertStatus(422)
        ->assertJsonPath('error', 'insufficient_keys')->assertJsonPath('message', fn ($m) => str_contains($m, '2 Keys'));
    $ok = lbPlayer(500, keys: 2);
    $this->actingAs($ok, 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['bet' => '40'])->assertCreated()
        ->assertJsonPath('data.my_bet', '40.00')->assertJsonPath('data.my_required_chips', '500.00');
    // Joining does not take any Keys.
    expect(leKeys($ok))->toBe(200);

    // At the 1,000 tier a 100 bet needs 2× = 200 ≤ 1,000, so the tier minimum decides.
    $big = lbCreate($this, lbPlayer(), ['min_entry' => 1000])->json('data.id');
    $this->actingAs(lbPlayer(999), 'sanctum')->postJson("/api/v1/lobbies/{$big}/join", ['bet' => '100'])->assertStatus(422)->assertJsonPath('error', 'insufficient_balance');
});

test('the 2× rule decides when it is above the tier: a bet the wallet cannot cover twice is refused', function () {
    config(['pusoy.lobby.tiers' => [100 => ['bets' => [5, 10, 80], 'keys' => 1]]]);
    $id = lbCreate($this, lbPlayer(), ['min_entry' => 100])->json('data.id');
    // 120 Chips ≥ the 100 tier but < 2 × 80.
    $this->actingAs(lbPlayer(120), 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['bet' => '80'])->assertStatus(422)
        ->assertJsonPath('message', fn ($m) => str_contains($m, '160.00 Chips') && str_contains($m, '2× your 80.00 Chips bet'));
    $this->actingAs(lbPlayer(120), 'sanctum')->postJson("/api/v1/lobbies/{$id}/join", ['bet' => '10'])->assertCreated();
});

test('Keys are deducted exactly once, when the game starts — never on join, never twice', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 500]);
    $players = [$owner, ...$others];
    foreach ($players as $p) {
        expect(leKeys($p))->toBe(5_000);
    }
    $table = lbStart($this, $players, $room);
    expect($table->status)->toBe(TableStatus::InGame);
    foreach ($players as $p) {
        expect(leKeys($p))->toBe(5_000 - 200);
    }
    expect(WalletTransaction::query()->where('type', TransactionType::LobbyEntryFee->value)->count())->toBe(4);

    // Repeated taps / looks / a second start attempt never charge again.
    foreach ($players as $p) {
        $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
        $this->actingAs($p, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk();
    }
    app(BankerMatchService::class)->maybeStart($table->fresh(), byOwner: true);
    expect(WalletTransaction::query()->where('type', TransactionType::LobbyEntryFee->value)->count())->toBe(4)
        ->and(leKeys($owner))->toBe(4_800)
        ->and(app(\App\Services\Wallet\WalletService::class)->reconcile()['ok'])->toBeTrue();
});

test('the game does not start (and nobody pays) if a player no longer meets the requirements', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $players = [$owner, ...$others];
    foreach ($players as $p) {
        $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertOk();
    }
    // A player's Keys disappear during the countdown.
    $w = app(\App\Services\Wallet\WalletService::class)->for($others[1], Currency::KY);
    app(\App\Services\Wallet\LedgerService::class)->transfer(new \App\Services\Wallet\TransferRequest(TransactionType::ManualAdjustment, Currency::KY, $w, null, $w->fresh()->balance, 'drain'));

    $this->travel(3100)->milliseconds();
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/lobbies/{$room['id']}")->assertOk()->assertJsonPath('data.table_status', 'WAITING_FOR_PLAYERS');
    expect(WalletTransaction::query()->where('type', TransactionType::LobbyEntryFee->value)->count())->toBe(0)
        ->and(GamePlayer::query()->where('game_table_id', $room['table_id'])->where('is_ready', true)->count())->toBe(0);
    // Pressing Start again tells them why.
    $this->actingAs($others[1], 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/start")->assertStatus(422)->assertJsonPath('error', 'insufficient_keys');
});

test('Keys are refunded when the match ends before any round is completed; not after a round', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $table = lbStart($this, [$owner, ...$others], $room);
    expect(leKeys($owner))->toBe(4_900);

    app(BankerMatchService::class)->end($table->fresh(), 'system_failure');
    foreach ([$owner, ...$others] as $p) {
        expect(leKeys($p))->toBe(5_000);
    }
    expect(WalletTransaction::query()->where('type', TransactionType::LobbyEntryRefund->value)->count())->toBe(4);
    // Ending again changes nothing.
    app(BankerMatchService::class)->end($table->fresh(), 'system_failure');
    expect(WalletTransaction::query()->where('type', TransactionType::LobbyEntryRefund->value)->count())->toBe(4);

    // A match with a completed round keeps the fees.
    [$o2, $r2, $x2] = lbFull($this, ['min_entry' => 100, 'name' => 'Second']);
    $t2 = lbStart($this, [$o2, ...$x2], $r2);
    lbPlayRound($t2);
    app(BankerMatchService::class)->end($t2->fresh(), 'not_enough_players');
    expect(leKeys($o2))->toBe(4_900)->and(WalletTransaction::query()->where('type', TransactionType::LobbyEntryRefund->value)->count())->toBe(4);
});

test('change your bet before the countdown; it withdraws your Start and is checked like a join', function () {
    [$owner, $room] = [lbPlayer(), null];
    $room = lbCreate($this, $owner, ['min_entry' => 1000])->json('data');
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/bet", ['bet' => '75'])->assertOk()->assertJsonPath('data.my_bet', '75.00');
    $this->actingAs($owner, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/bet", ['bet' => '20'])->assertStatus(422)->assertJsonPath('error', 'invalid_bet');
    $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/bet", ['bet' => '50'])->assertStatus(404);
    expect(GamePlayer::query()->where('user_id', $owner->id)->value('selected_bet'))->toBe(7_500);
});

test('Quick Join skips lobbies whose Keys fee you cannot pay', function () {
    $a = lbCreate($this, lbPlayer(), ['min_entry' => 1000, 'name' => 'Five keys'])->json('data.id');
    $b = lbCreate($this, lbPlayer(), ['min_entry' => 100, 'name' => 'One key'])->json('data.id');
    $this->actingAs(lbPlayer(), 'sanctum')->postJson("/api/v1/lobbies/{$a}/join")->assertCreated(); // fuller, but 5 Keys

    $this->actingAs(lbPlayer(10_000, keys: 1), 'sanctum')->postJson('/api/v1/lobbies/quick-join')->assertCreated()->assertJsonPath('data.id', $b)->assertJsonPath('data.my_bet', '5.00');
    $this->actingAs(lbPlayer(10_000, keys: 0), 'sanctum')->postJson('/api/v1/lobbies/quick-join')->assertStatus(404)->assertJsonPath('error', 'no_lobby');
});

test('a player who cannot cover 2× their selected bet sits rounds out; the banker needs 6× the maximum bet', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $this->actingAs($others[2], 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/bet", ['bet' => '15'])->assertOk();
    $table = lbStart($this, [$owner, ...$others], $room);
    lbPlayRound($table);
    // Seat 4 now holds 29 Chips: below 2 × 15.
    $w = app(\App\Services\Wallet\WalletService::class)->for($others[2], Currency::CH);
    app(\App\Services\Wallet\LedgerService::class)->transfer(new \App\Services\Wallet\TransferRequest(TransactionType::ManualAdjustment, Currency::CH, $w, null, $w->fresh()->balance - 2_900, 'drain'));
    $this->travel(10)->seconds();
    app(BankerMatchService::class)->startRound($table->fresh());

    $session = \App\Models\GameSession::query()->find($table->fresh()->current_session_id);
    expect($session->round_number)->toBe(2)->and($session->config['participants'])->not->toContain($others[2]->id)
        ->and($session->banker_user_id)->not->toBe($others[2]->id)
        ->and($session->config['banker_selection']['required'])->toBe(9_000); // 6 × 15
});

test('in the actual game each tier accepts only its own bets; other amounts, 2×-short wallets and second bets are refused', function () {
    foreach ([100 => [[5, 10, 15], [1, 20, 25, 50]], 500 => [[20, 30, 40], [5, 15, 25, 50]], 1000 => [[50, 75, 100], [20, 60, 150, 99.5]]] as $entry => [$allowed, $refused]) {
        [$owner, $room, $others] = lbFull($this, ['min_entry' => $entry, 'name' => "Tier {$entry}"]);
        $table = lbStart($this, [$owner, ...$others], $room);
        $session = \App\Models\GameSession::query()->find($table->fresh()->current_session_id);
        expect(array_map(fn ($c) => (int) $c / 100, $session->config['bet_chips']))->toBe($allowed);

        $players = collect([$owner, ...$others])->filter(fn ($u) => $u->id !== $session->banker_user_id)->values();
        $bet = fn ($u, $amount) => $this->actingAs($u, 'sanctum')->postJson("/api/v1/games/{$session->id}/bet", ['amount' => number_format($amount, 2, '.', '')]);

        // The game state lists exactly the tier's chips.
        $this->actingAs($players[0], 'sanctum')->getJson("/api/v1/games/{$session->id}")->assertOk()
            ->assertJsonPath('data.config.bet_chips', array_map(fn ($c) => number_format($c, 2, '.', ''), $allowed));

        foreach ($refused as $amount) {
            $bet($players[0], $amount)->assertStatus(422)->assertJsonPath('error', 'invalid_bet');
        }
        // 2× the bet must be in the wallet.
        $w = app(\App\Services\Wallet\WalletService::class)->for($players[1], Currency::CH);
        app(\App\Services\Wallet\LedgerService::class)->transfer(new \App\Services\Wallet\TransferRequest(TransactionType::ManualAdjustment, Currency::CH, $w, null, $w->fresh()->balance - ($allowed[2] * 2 * 100 - 1), 'drain'));
        $bet($players[1], $allowed[2])->assertStatus(422)->assertJsonPath('error', 'insufficient_balance');
        $bet($players[1], $allowed[0])->assertCreated();

        // An allowed bet is taken once; a repeated tap or retry is refused and holds nothing more.
        $before = (int) app(\App\Services\Wallet\WalletService::class)->for($players[0], Currency::CH)->fresh()->balance;
        $bet($players[0], $allowed[1])->assertCreated();
        $bet($players[0], $allowed[1])->assertStatus(409)->assertJsonPath('error', 'already_bet');
        expect($before - (int) app(\App\Services\Wallet\WalletService::class)->for($players[0], Currency::CH)->fresh()->balance)->toBe($allowed[1] * 2 * 100)
            ->and(\App\Models\GameBet::query()->where('game_session_id', $session->id)->where('user_id', $players[0]->id)->value('amount'))->toBe($allowed[1] * 100);
    }
});

test('betting timeout: the server auto-bets the tier minimum (5 / 20 / 50) exactly once, recorded as AUTO', function () {
    foreach ([100 => 500, 500 => 2_000, 1000 => 5_000] as $entry => $min) {
        [$owner, $room, $others] = lbFull($this, ['min_entry' => $entry, 'name' => "Auto {$entry}"]);
        // Every player selected the biggest bet in the waiting room: the timeout still uses the minimum.
        foreach ([$owner, ...$others] as $p) {
            $this->actingAs($p, 'sanctum')->postJson("/api/v1/lobbies/{$room['id']}/bet", ['bet' => number_format(max($entry === 100 ? [5, 10, 15] : ($entry === 500 ? [20, 30, 40] : [50, 75, 100])), 2, '.', '')])->assertOk();
        }
        $table = lbStart($this, [$owner, ...$others], $room);
        $session = \App\Models\GameSession::query()->find($table->fresh()->current_session_id);
        $players = collect([$owner, ...$others])->reject(fn ($u) => $u->id === $session->banker_user_id)->values();

        // One player bets by hand in time; the others let the timer run out.
        $manual = $players[0];
        $this->actingAs($manual, 'sanctum')->postJson("/api/v1/games/{$session->id}/bet", ['amount' => number_format($min / 100 * 2, 2, '.', '')])->assertCreated();
        $this->travel(((int) $session->config['betting_seconds']) + 2)->seconds();
        // A late manual bet is refused; the timeout job may fire more than once.
        $this->actingAs($players[1], 'sanctum')->postJson("/api/v1/games/{$session->id}/bet", ['amount' => number_format($min / 100, 2, '.', '')])->assertStatus(409);
        app(BankerMatchService::class)->closeBetting($session->fresh());
        app(BankerMatchService::class)->closeBetting($session->fresh(), true);

        $bets = \App\Models\GameBet::query()->where('game_session_id', $session->id)->get()->keyBy('user_id');
        expect($bets)->toHaveCount(3)
            ->and($bets[$manual->id]->is_auto)->toBeFalse()->and($bets[$manual->id]->amount)->toBe($min * 2);
        foreach ($players->slice(1) as $p) {
            expect($bets[$p->id]->is_auto)->toBeTrue()->and($bets[$p->id]->amount)->toBe($min);
        }
        // Ledger: AUTO / MANUAL with player, round and time.
        $tx = WalletTransaction::query()->where('game_session_id', $session->id)->where('related_player_id', $players[1]->id)->where('idempotency_key', "bet:{$session->id}:{$players[1]->id}")->sole();
        expect($tx->metadata['bet_type'])->toBe('AUTO')->and($tx->metadata['round'])->toBe(1)->and($tx->reason)->toStartWith('Auto-bet (time expired)');
        expect(WalletTransaction::query()->where('idempotency_key', "bet:{$session->id}:{$manual->id}")->sole()->metadata['bet_type'])->toBe('MANUAL');

        // The game state says so: AUTO for you and for others' seats.
        $state = $this->actingAs($players[1], 'sanctum')->getJson("/api/v1/games/{$session->id}")->assertOk()->json('data');
        expect($state['my_bet'])->toBe(number_format($min / 100, 2, '.', ''))->and($state['my_bet_type'])->toBe('AUTO')
            ->and(collect($state['players'])->firstWhere('user_id', $manual->id)['bet_type'])->toBe('MANUAL');
        app(BankerMatchService::class)->end($table->fresh(), 'test_done');
    }
});

test('betting timeout: a player without 2× the minimum bet is not auto-bet, sits the round out and is told why', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $table = lbStart($this, [$owner, ...$others], $room);
    $session = \App\Models\GameSession::query()->find($table->fresh()->current_session_id);
    $poor = collect($others)->first(fn ($u) => $u->id !== $session->banker_user_id);
    // 9.99 Chips: below 2 × 5.
    $w = app(\App\Services\Wallet\WalletService::class)->for($poor, Currency::CH);
    app(\App\Services\Wallet\LedgerService::class)->transfer(new \App\Services\Wallet\TransferRequest(TransactionType::ManualAdjustment, Currency::CH, $w, null, $w->fresh()->balance - 999, 'drain'));

    $this->travel(((int) $session->config['betting_seconds']) + 2)->seconds();
    app(BankerMatchService::class)->closeBetting($session->fresh());

    expect(\App\Models\GameBet::query()->where('game_session_id', $session->id)->where('user_id', $poor->id)->exists())->toBeFalse()
        ->and(\App\Models\GameBet::query()->where('game_session_id', $session->id)->count())->toBe(2)
        ->and((int) $w->fresh()->balance)->toBe(999);
    $this->actingAs($poor, 'sanctum')->getJson("/api/v1/games/{$session->id}")->assertOk()
        ->assertJsonPath('data.my_bet', null)
        ->assertJsonPath('data.my_auto_bet_skipped', fn ($m) => is_string($m) && str_contains($m, '10.00'));
});
