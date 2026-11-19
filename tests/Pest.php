<?php

use App\Enums\Currency;
use App\Enums\WalletType;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Models\User;
use App\Services\Game\TableService;
use App\Services\Wallet\AllocationService;
use App\Services\Wallet\WalletService;
use Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function superAdmin(): User
{
    return User::factory()->superAdmin()->create();
}

/**
 * Credit a wallet through the real allocation workflow (Super Admin issuance).
 */
function fund(User $user, int $minor, Currency $currency = Currency::CH): void
{
    $issuer = User::query()->where('role', 'super_admin')->where('username', 'test-issuer')->first()
        ?? User::factory()->superAdmin()->create(['username' => 'test-issuer']);

    app(AllocationService::class)->allocate($issuer, $user, $currency, $minor, 'test funding');
}

function balance(User $user, Currency $currency = Currency::CH, WalletType $type = WalletType::Player): int
{
    return app(WalletService::class)->for($user, $currency, $type)->fresh()->balance;
}

/**
 * Seat four funded players at a fresh table in the room and ready them,
 * which starts the game.
 *
 * @return array{0: GameTable, 1: ?GameSession, 2: list<User>}
 */
function startGame(?GameRoom $room = null, bool $ready = true): array
{
    $room ??= GameRoom::factory()->create();
    $tables = app(TableService::class);
    $players = [];

    foreach (range(1, 4) as $i) {
        $player = User::factory()->player()->create();
        fund($player, $room->entry_amount * 3, $room->currency);
        $players[] = $player;
        $seat = $tables->join($player, $room);
    }

    $table = $seat->table->fresh();

    if ($ready) {
        foreach ($players as $player) {
            $tables->setReady($player, $table, true);
        }
    }

    $table->refresh();

    return [$table, $table->currentSession, $players];
}
