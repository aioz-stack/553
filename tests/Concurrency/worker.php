<?php

/**
 * Child process used by tests/Concurrency/*: boots the app against the
 * MySQL test database and performs one action, printing a JSON result.
 * Many of these run at the same time to exercise real row locking.
 *
 * Usage: php tests/Concurrency/worker.php <action> '<json args>'
 */

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Exceptions\BusinessRuleException;
use App\Game\AutoArranger;
use App\Models\GameCard;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\User;
use App\Services\Game\BankerMatchService;
use App\Services\Game\GameEngine;
use App\Services\Game\TableService;
use App\Services\Wallet\AllocationService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/../../vendor/autoload.php';

$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[$action, $json] = [$argv[1] ?? '', $argv[2] ?? '{}'];
$args = json_decode($json, true);

try {
    $result = match ($action) {
        'debit' => (function () use ($args) {
            $wallets = app(WalletService::class);
            $tx = app(LedgerService::class)->transfer(new TransferRequest(
                TransactionType::PlayerDebit,
                Currency::CH,
                $wallets->for(User::findOrFail($args['from']), Currency::CH),
                $wallets->for(User::findOrFail($args['to']), Currency::CH),
                $args['amount'],
                idempotencyKey: $args['key'] ?? null,
            ));

            return ['tx' => $tx->id];
        })(),
        'allocate' => ['tx' => app(AllocationService::class)->allocate(
            User::findOrFail($args['actor']),
            User::findOrFail($args['recipient']),
            Currency::CH,
            $args['amount'],
            'concurrency test',
            $args['key'] ?? null,
        )->id],
        'join' => ['seat' => app(TableService::class)->join(User::findOrFail($args['user']), GameRoom::findOrFail($args['room']))->only(['game_table_id', 'seat'])],
        'submit' => (function () use ($args) {
            $user = User::findOrFail($args['user']);
            $session = GameSession::findOrFail($args['session']);
            $a = AutoArranger::arrange(GameCard::query()->where('game_session_id', $session->id)->where('user_id', $user->id)->value('cards'));
            app(GameEngine::class)->submit($user, $session, $a->front, $a->middle, $a->back);

            return ['submitted' => true];
        })(),
        'bet' => (function () use ($args) {
            $bet = app(BankerMatchService::class)->placeBet(User::findOrFail($args['user']), GameSession::findOrFail($args['session']), $args['amount']);

            return ['bet' => $bet->id];
        })(),
        'resolve' => (function () use ($args) {
            app(GameEngine::class)->resolve(GameSession::findOrFail($args['session']));

            return ['resolved' => true];
        })(),
        default => throw new InvalidArgumentException("Unknown action {$action}"),
    };

    echo json_encode(['ok' => true] + $result);
} catch (BusinessRuleException $e) {
    echo json_encode(['ok' => false, 'error' => $e->errorCode(), 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    echo json_encode(['ok' => false, 'error' => 'exception', 'message' => $e::class.': '.$e->getMessage()]);
}
