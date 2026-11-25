<?php

use App\Enums\Currency;
use App\Enums\TableStatus;
use App\Enums\WalletType;
use App\Models\AuditLog;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Models\User;
use App\Models\WalletHold;
use App\Services\Game\BankerMatchService;
use App\Services\Game\TableService;
use App\Services\Wallet\WalletService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

function ttBalances(array $users): array
{
    $w = app(WalletService::class);

    return collect($users)->mapWithKeys(fn (User $u) => [$u->id => [(int) $w->for($u, Currency::CH)->fresh()->balance, (int) $w->for($u, Currency::KY)->fresh()->balance]])->all();
}

test('terminating a table mid-round: held Chips back to their owners, Keys untouched, nobody seated, players told', function () {
    [$owner, $room, $others] = lbFull($this, ['min_entry' => 100]);
    $players = [$owner, ...$others];
    $table = lbStart($this, $players, $room);
    $session = GameSession::query()->find($table->fresh()->current_session_id);
    // Two players bet (their 2× and the banker's cover are held).
    $bettors = collect($players)->reject(fn ($u) => $u->id === $session->banker_user_id)->take(2);
    foreach ($bettors as $u) {
        app(BankerMatchService::class)->placeBet($u, $session, 500);
    }
    $held = WalletHold::query()->where('game_table_id', $table->id)->where('status', 'held')->get()->groupBy('user_id')->map->sum('amount');
    expect($held->sum())->toBe(4 * 1_000);
    $before = ttBalances($players);

    $this->artisan('pusoy:terminate-table', ['table' => $table->id])->assertSuccessful();

    $t = $table->fresh();
    expect($t->status)->toBe(TableStatus::Closed)->and($t->end_reason)->toBe('terminated_by_admin')
        ->and($session->fresh()->status->value)->toBe('CANCELLED')
        ->and(WalletHold::query()->where('game_table_id', $table->id)->where('status', 'held')->count())->toBe(0);
    $after = ttBalances($players);
    foreach ($players as $u) {
        // Chips: exactly what was held comes back. Keys: unchanged (no refund).
        expect($after[$u->id][0])->toBe($before[$u->id][0] + (int) ($held[$u->id] ?? 0))
            ->and($after[$u->id][1])->toBe($before[$u->id][1])
            ->and(app(TableService::class)->activeSeat($u->fresh()))->toBeNull();
    }
    expect(app(WalletService::class)->reconcile()['ok'])->toBeTrue()
        ->and(AuditLog::query()->where('action', 'table.terminated')->count())->toBe(1);

    // The players' game state says why (the app goes to Game Home).
    $this->actingAs($owner, 'sanctum')->getJson("/api/v1/tables/{$table->id}")->assertOk()
        ->assertJsonPath('data.status', 'CLOSED')->assertJsonPath('data.end_reason', 'terminated_by_admin');

    // Running it again changes nothing.
    $this->artisan('pusoy:terminate-table', ['table' => $table->id])->assertSuccessful();
    expect(ttBalances($players))->toBe($after);
});

test('terminating a waiting lobby table closes it; an unknown table is refused', function () {
    $owner = lbPlayer();
    $room = lbCreate($this, $owner)->json('data');
    $this->artisan('pusoy:terminate-table', ['table' => $room['table_id']])->assertSuccessful();
    expect(GameTable::query()->find($room['table_id'])->status)->toBe(TableStatus::Closed)
        ->and(app(TableService::class)->activeSeat($owner->fresh()))->toBeNull();

    $this->artisan('pusoy:terminate-table', ['table' => 99999])->assertFailed();
});
