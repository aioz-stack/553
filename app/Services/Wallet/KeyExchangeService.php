<?php

namespace App\Services\Wallet;

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Events\Game\GameEvents;
use App\Events\Game\UserEvent;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientBalanceException;
use App\Models\KeyExchange;
use App\Models\User;
use App\Models\Wallet;
use App\Services\Audit\AuditLogger;
use App\Services\System\MaintenanceService;
use App\Support\Points;
use Illuminate\Support\Facades\DB;

/**
 * Shop: exchange Keys for Gold at the fixed packages in config('pusoy.shop.key_packages').
 *
 * One database transaction does everything: the player's row and Keys wallet are locked, the Keys
 * balance is checked, the Keys leave the Keys wallet and the Gold enters the Gold wallet (two ledger
 * entries, KEY_EXCHANGE), and the exchange is logged. Any failure rolls all of it back — neither
 * wallet changes. A repeated request with the same idempotency key returns the first result and
 * never deducts twice. Exchanges are final: there is no refund and no Gold → Keys.
 */
class KeyExchangeService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    /** @return array<string, array{keys: int, gold: int}> */
    public static function packages(): array
    {
        return config('pusoy.shop.key_packages', []);
    }

    public function exchange(User $user, string $package, string $idempotencyKey): KeyExchange
    {
        if (! $user->isPlayer() || ! $user->isActive()) {
            throw new BusinessRuleException('Only active players can use the Shop.', 403, 'forbidden');
        }

        $pack = self::packages()[$package] ?? throw new BusinessRuleException('Choose one of the Shop packages.', 422, 'invalid_package');
        $keys = (int) $pack['keys'] * Points::SCALE;
        $gold = (int) $pack['gold'] * Points::SCALE;

        if ($done = $this->previous($user, $idempotencyKey)) {
            return $done;
        }

        try {
            $exchange = DB::transaction(function () use ($user, $package, $keys, $gold, $idempotencyKey) {
                // One exchange at a time per player; re-check the key under the lock.
                User::query()->whereKey($user->id)->lockForUpdate()->first();
                if ($done = $this->previous($user, $idempotencyKey)) {
                    return $done;
                }

                app(MaintenanceService::class)->assertTransactionsAllowed($user, $user);

                $keyWallet = Wallet::query()->whereKey($this->wallets->for($user, Currency::KY)->id)->lockForUpdate()->firstOrFail();
                $goldWallet = $this->wallets->for($user, Currency::GD);

                if ($keyWallet->balance < $keys) {
                    throw new InsufficientBalanceException;
                }

                $meta = ['package' => $package, 'keys' => $keys, 'gold' => $gold];
                $keysTx = $this->ledger->transfer(new TransferRequest(
                    type: TransactionType::KeyExchange,
                    currency: Currency::KY,
                    source: $keyWallet,
                    destination: null,
                    amount: $keys,
                    reason: 'Shop: '.Points::decimal($keys).' Keys exchanged for '.Points::decimal($gold).' Gold',
                    actor: $user,
                    idempotencyKey: "keyx:{$user->id}:{$idempotencyKey}:keys",
                    relatedPlayerId: $user->id,
                    metadata: $meta,
                ));
                $goldTx = $this->ledger->transfer(new TransferRequest(
                    type: TransactionType::KeyExchange,
                    currency: Currency::GD,
                    source: null,
                    destination: $goldWallet,
                    amount: $gold,
                    reason: 'Shop: Gold from '.Points::decimal($keys).' Keys',
                    actor: $user,
                    idempotencyKey: "keyx:{$user->id}:{$idempotencyKey}:gold",
                    relatedPlayerId: $user->id,
                    metadata: $meta,
                ));

                // (updateOrCreate: a retry of an attempt refused earlier for too few Keys reuses its row)
                $exchange = KeyExchange::query()->updateOrCreate(['user_id' => $user->id, 'idempotency_key' => $idempotencyKey], [
                    'package' => $package,
                    'keys_amount' => $keys,
                    'gold_amount' => $gold,
                    'status' => KeyExchange::COMPLETED,
                    'failure_reason' => null,
                    'keys_transaction_id' => $keysTx->id,
                    'gold_transaction_id' => $goldTx->id,
                ]);
                AuditLogger::log($user, 'shop.key_exchange', $exchange, null, $meta + ['keys_reference' => $keysTx->reference, 'gold_reference' => $goldTx->reference]);

                return $exchange;
            });
        } catch (InsufficientBalanceException) {
            $this->reject($user, $package, $keys, $gold, $idempotencyKey, 'insufficient_keys');

            throw new BusinessRuleException('Not enough Keys for this package. You need '.Points::decimal($keys).' Keys.', 422, 'insufficient_keys');
        }

        $this->pushBalances($user);

        return $exchange;
    }

    private function previous(User $user, string $idempotencyKey): ?KeyExchange
    {
        return KeyExchange::query()->where('user_id', $user->id)->where('idempotency_key', $idempotencyKey)->where('status', KeyExchange::COMPLETED)->first();
    }

    /** Log a refused attempt (nothing moved). */
    private function reject(User $user, string $package, int $keys, int $gold, string $idempotencyKey, string $reason): void
    {
        KeyExchange::query()->updateOrCreate(
            ['user_id' => $user->id, 'idempotency_key' => $idempotencyKey],
            ['package' => $package, 'keys_amount' => $keys, 'gold_amount' => $gold, 'status' => KeyExchange::REJECTED, 'failure_reason' => $reason],
        );
    }

    /** Push the new Keys and Gold balances to the player's private channel only. */
    private function pushBalances(User $user): void
    {
        foreach ([Currency::KY, Currency::GD] as $currency) {
            $balance = (int) Wallet::query()->where('user_id', $user->id)->where('currency', $currency->value)->where('type', 'player')->value('balance');
            event(new UserEvent($user->id, GameEvents::WALLET_UPDATED, ['currency' => $currency->value, 'balance' => Points::decimal($balance)]));
        }
    }
}
