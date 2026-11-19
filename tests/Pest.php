<?php

use App\Enums\Currency;
use App\Enums\WalletType;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Models\User;
use App\Services\Game\TableService;
use App\Enums\TransactionType;
use App\Services\Wallet\AllocationService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

/** A Super Admin with a float of 1,000,000 Chips issued into their own wallet (loads draw on it). */
function superAdmin(): User
{
    $user = User::factory()->superAdmin()->create();
    app(AllocationService::class)->issue($user, 1_000_000_00, 'test float');

    return $user;
}

/**
 * Credit a wallet the real way: Chips are issued to a Super Admin and loaded through the
 * allocation workflow (Load Logs and all); Gold (Single Player only, never loaded) is
 * credited straight through the ledger.
 */
function fund(User $user, int $minor, Currency $currency = Currency::CH): void
{
    if ($currency === Currency::GD) {
        $wallets = app(WalletService::class);
        app(LedgerService::class)->transfer(new TransferRequest(TransactionType::ManualAdjustment, Currency::GD, null, $wallets->for($user, Currency::GD), $minor, 'test funding'));

        return;
    }

    $issuer = User::query()->where('role', 'super_admin')->where('username', 'test-issuer')->first()
        ?? User::factory()->superAdmin()->create(['username' => 'test-issuer']);

    $allocations = app(AllocationService::class);
    $allocations->issue($issuer, $minor, 'test issuance');
    $allocations->allocate($issuer, $user, $currency, $minor, 'test funding');
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
