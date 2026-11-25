<?php

namespace App\Services\Wallet;

use App\Enums\AgentLevel;
use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Events\Game\GameEvents;
use App\Events\Game\UserEvent;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientBalanceException;
use App\Models\Agent;
use App\Models\KeyExchange;
use App\Models\KeyExchangeShare;
use App\Models\User;
use App\Models\Wallet;
use App\Services\Audit\AuditLogger;
use App\Services\System\MaintenanceService;
use App\Support\Points;
use Illuminate\Support\Facades\DB;

/**
 * Shop: players buy Keys with Chips at a fixed 5 Chips = 1 Key (config('pusoy.shop')).
 *
 * One database transaction does everything, or nothing:
 *  1. lock the player and their Chips wallet, check the package and the Chips balance;
 *  2. work out the player's direct upline and hierarchy (snapshot kept on the exchange);
 *  3. share the Chips paid by the direct-upline scenario (always 100% in total):
 *       Admin → Admin 100% · Incorporator → Admin 40% / Incorporator 60% ·
 *       Master Agent → Admin 40% / Incorporator 10% / Master Agent 50%
 *     — each share is one ledger entry from the player's Chips wallet straight into the
 *     recipient's Revenue wallet (never a Keys wallet; the recipient moves it into Chips with
 *     Self Convert Revenue to Chips — RevenueConversionService). A share whose recipient is missing from the
 *     chain goes to the Admin, and to the platform's Chips wallet when there is no Admin;
 *  4. credit the Keys to the player's Keys wallet;
 *  5. log the exchange (key_exchanges) and every share (key_exchange_shares), and audit it.
 * Same idempotency key = the first result, never a second deduction. Refused attempts (too few
 * Chips) are logged with nothing moved and earn nobody anything. Exchanges are final.
 */
class KeyExchangeService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    /** @return array<string, array{keys: int, chips: int}> */
    public static function packages(): array
    {
        $rate = self::chipsPerKey();

        // The price always follows the fixed rate (Chips = Keys × 5), whatever else is configured.
        return collect(config('pusoy.shop.key_packages', []))->map(fn (array $p) => ['keys' => (int) $p['keys'], 'chips' => (int) $p['keys'] * $rate])->all();
    }

    public static function chipsPerKey(): int
    {
        return (int) config('pusoy.shop.chips_per_key', 5);
    }

    public function exchange(User $user, string $package, string $idempotencyKey): KeyExchange
    {
        if (! $user->isPlayer() || ! $user->isActive()) {
            throw new BusinessRuleException('Only active players can use the Shop.', 403, 'forbidden');
        }

        $pack = self::packages()[$package] ?? throw new BusinessRuleException('Choose one of the Shop packages.', 422, 'invalid_package');
        $keys = $pack['keys'] * Points::SCALE;
        $chips = $pack['chips'] * Points::SCALE;

        if ($done = $this->previous($user, $idempotencyKey)) {
            return $done;
        }

        try {
            $exchange = DB::transaction(function () use ($user, $package, $keys, $chips, $idempotencyKey) {
                User::query()->whereKey($user->id)->lockForUpdate()->first();
                if ($done = $this->previous($user, $idempotencyKey)) {
                    return $done;
                }

                app(MaintenanceService::class)->assertTransactionsAllowed($user, $user);

                $chipsWallet = Wallet::query()->whereKey($this->wallets->for($user, Currency::CH)->id)->lockForUpdate()->firstOrFail();
                if ($chipsWallet->is_frozen) {
                    throw new BusinessRuleException('Your Chips wallet is frozen.', 423, 'wallet_frozen');
                }
                if ($chipsWallet->balance < $chips) {
                    throw new InsufficientBalanceException;
                }

                $tree = $this->hierarchy($user);
                $plan = $this->shares($tree, $chips);

                $exchange = KeyExchange::query()->updateOrCreate(['user_id' => $user->id, 'idempotency_key' => $idempotencyKey], [
                    'package' => $package,
                    'direction' => KeyExchange::CHIPS_TO_KEYS,
                    'chips_amount' => $chips,
                    'keys_amount' => $keys,
                    'reward_amount' => $keys,
                    'reward_currency' => Currency::KY->value,
                    'player_username' => $user->username,
                    'upline_user_id' => $tree['upline']?->id,
                    'scenario' => $tree['scenario'],
                    'hierarchy' => $tree['path'],
                    'status' => KeyExchange::COMPLETED,
                    'failure_reason' => null,
                ]);

                $meta = ['exchange_id' => $exchange->id, 'package' => $package, 'chips' => $chips, 'keys' => $keys, 'scenario' => $tree['scenario']];

                foreach ($plan as $share) {
                    $tx = $this->ledger->transfer(new TransferRequest(
                        type: TransactionType::KeyExchange,
                        currency: Currency::CH,
                        source: $chipsWallet->fresh(),
                        destination: $share['wallet'],
                        amount: $share['amount'],
                        reason: 'Shop: '.Points::decimal($keys).' Keys bought by '.$user->username.' — '.ucfirst($share['role']).' share '.($share['bps'] / 100).'%',
                        actor: $user,
                        idempotencyKey: "keyx:{$user->id}:{$idempotencyKey}:share:{$share['role']}",
                        relatedPlayerId: $user->id,
                        relatedAgentId: $share['user']?->agent?->id,
                        metadata: $meta + ['role' => $share['role'], 'percent' => $share['bps'] / 100],
                    ));
                    KeyExchangeShare::query()->create([
                        'key_exchange_id' => $exchange->id,
                        'role' => $share['role'],
                        'recipient_user_id' => $share['user']?->id,
                        'percent_bps' => $share['bps'],
                        'amount' => $share['amount'],
                        'wallet_id' => $share['wallet']->id,
                        'wallet_transaction_id' => $tx->id,
                    ]);
                }

                $keysTx = $this->ledger->transfer(new TransferRequest(
                    type: TransactionType::KeyExchange,
                    currency: Currency::KY,
                    source: null,
                    destination: $this->wallets->for($user, Currency::KY),
                    amount: $keys,
                    reason: 'Shop: '.Points::decimal($keys).' Keys for '.Points::decimal($chips).' Chips',
                    actor: $user,
                    idempotencyKey: "keyx:{$user->id}:{$idempotencyKey}:keys",
                    relatedPlayerId: $user->id,
                    metadata: $meta,
                ));
                $exchange->forceFill(['keys_transaction_id' => $keysTx->id])->save();

                AuditLogger::log($user, 'shop.chips_to_keys', $exchange, null, $meta + [
                    'upline' => $tree['upline']?->username,
                    'shares' => array_map(fn ($s) => ['role' => $s['role'], 'user' => $s['user']?->username, 'percent' => $s['bps'] / 100, 'amount' => $s['amount']], $plan),
                ]);

                return $exchange;
            });
        } catch (InsufficientBalanceException) {
            $this->reject($user, $package, $keys, $chips, $idempotencyKey, 'insufficient_chips');

            throw new BusinessRuleException('Not enough Chips for this package. You need '.Points::decimal($chips).' Chips.', 422, 'insufficient_chips');
        }

        // A repeat of an earlier request (same key) moved nothing: report it as such (200, not 201).
        $isNew = $exchange->wasRecentlyCreated || $exchange->wasChanged('keys_transaction_id');
        if ($isNew) {
            $this->pushBalances($exchange);
        }

        $fresh = $exchange->fresh(['shares.recipient']);
        $fresh->wasRecentlyCreated = $isNew;

        return $fresh;
    }

    /**
     * The player's direct upline and the chain above it, as it is right now.
     *
     * @return array{scenario: string, upline: ?User, admin: ?User, incorporator: ?User, master: ?User, path: list<array{role: string, user_id: int, username: string}>}
     */
    public function hierarchy(User $player): array
    {
        $isAdmin = fn (?User $u) => $u && ($u->isSuperAdmin() || $u->isAdministrator());
        // Always the hierarchy as stored right now (never relations loaded earlier on this model).
        $player = User::query()->with(['agentLink.agent.user', 'agentLink.agent.parent.user', 'sponsor.agent'])->findOrFail($player->id);
        $agent = $player->agentLink?->agent ?? ($player->sponsor?->isAgent() ? $player->sponsor->agent : null);

        $master = $incorporator = $admin = null;
        if ($agent instanceof Agent) {
            if ($agent->level === AgentLevel::Master) {
                $master = $agent->user;
                $incorporator = $agent->parent?->level === AgentLevel::Agent ? $agent->parent->user : null;
            } else {
                $incorporator = $agent->user;
            }
            $top = $incorporator ?? $master;
            $admin = $this->adminAbove($top);
            $scenario = $master ? 'master' : 'incorporator';
            $upline = $master ?? $incorporator;
        } else {
            $admin = $isAdmin($player->sponsor) ? $player->sponsor : null;
            $scenario = 'admin';
            $upline = $admin;
        }

        // Every chain ends at an Admin: older accounts without a recorded sponsor or creator
        // belong to the platform's Super Admin, so the Admin share always reaches an Admin's Chips.
        $admin ??= $this->platformAdmin();
        if ($scenario === 'admin') {
            $upline ??= $admin;
        }

        $path = [];
        foreach (['master' => $master, 'incorporator' => $incorporator, 'admin' => $admin] as $role => $u) {
            if ($u) {
                $path[] = ['role' => $role, 'user_id' => $u->id, 'username' => $u->username];
            }
        }

        return compact('scenario', 'upline', 'admin', 'incorporator', 'master', 'path');
    }

    /**
     * The Admin (Super Admin or Administrator) above a top-level agent: its sponsor, otherwise the
     * Admin who created the account (older accounts made before sponsors were recorded).
     */
    private function adminAbove(?User $agentUser): ?User
    {
        if ($agentUser === null) {
            return null;
        }
        $isAdmin = fn (?User $u) => $u && ($u->isSuperAdmin() || $u->isAdministrator()) && $u->isActive();
        foreach ([$agentUser->sponsor_id, $agentUser->agent?->created_by, $agentUser->created_by] as $id) {
            $candidate = $id ? User::query()->find($id) : null;
            if ($isAdmin($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /** The platform's Super Admin (the first active one), who owns any chain without a recorded Admin. */
    public function platformAdmin(): ?User
    {
        return User::query()->where('role', \App\Enums\Role::SuperAdmin->value)->where('status', \App\Enums\UserStatus::Active->value)->orderBy('id')->first();
    }

    /**
     * The scenario's percentages (always 100% in total) turned into Chips amounts for real
     * recipients: a missing role's share goes to the Admin, then to the platform.
     *
     * @return list<array{role: string, user: ?User, bps: int, amount: int, wallet: Wallet}>
     */
    private function shares(array $tree, int $chips): array
    {
        // The Administrator's current rates (ShopRevenueShares; config defaults until saved).
        $rates = app(ShopRevenueShares::class)->forScenario($tree['scenario']);
        if (array_sum($rates) !== 10000) {
            throw new BusinessRuleException('The Shop revenue shares are misconfigured.', 500, 'shares_invalid');
        }

        // Move a missing recipient's share up to the Admin (or the platform).
        $bps = [];
        foreach ($rates as $role => $b) {
            $target = $tree[$role] ? $role : ($tree['admin'] ? 'admin' : 'platform');
            $bps[$target] = ($bps[$target] ?? 0) + (int) $b;
        }

        $out = [];
        $given = 0;
        foreach ($bps as $role => $b) {
            $amount = intdiv($chips * $b, 10000);
            $given += $amount;
            $user = $role === 'platform' ? null : $tree[$role];
            $out[] = [
                'role' => $role,
                'user' => $user,
                'bps' => $b,
                'amount' => $amount,
                'wallet' => $user ? $this->wallets->for($user, Currency::CH, WalletType::Share) : $this->wallets->platform(Currency::CH),
            ];
        }
        // Any rounding remainder goes to the first recipient, so the shares add up to exactly the Chips paid.
        $out[0]['amount'] += $chips - $given;

        return array_values(array_filter($out, fn ($s) => $s['amount'] > 0));
    }

    private function previous(User $user, string $idempotencyKey): ?KeyExchange
    {
        return KeyExchange::query()->where('user_id', $user->id)->where('idempotency_key', $idempotencyKey)->where('status', KeyExchange::COMPLETED)->first();
    }

    /** Log a refused attempt (nothing moved, nobody earns anything). */
    private function reject(User $user, string $package, int $keys, int $chips, string $idempotencyKey, string $reason): void
    {
        KeyExchange::query()->updateOrCreate(
            ['user_id' => $user->id, 'idempotency_key' => $idempotencyKey],
            ['package' => $package, 'direction' => KeyExchange::CHIPS_TO_KEYS, 'chips_amount' => $chips, 'keys_amount' => $keys, 'reward_amount' => $keys, 'reward_currency' => Currency::KY->value, 'player_username' => $user->username, 'status' => KeyExchange::REJECTED, 'failure_reason' => $reason],
        );
    }

    /** Live balances: the player's Chips and Keys, and each recipient's Revenue (their own channels only). */
    private function pushBalances(KeyExchange $exchange): void
    {
        $push = function (int $userId, Currency $currency, WalletType $type) {
            $balance = (int) Wallet::query()->where('user_id', $userId)->where('currency', $currency->value)->where('type', $type->value)->value('balance');
            event(new UserEvent($userId, GameEvents::WALLET_UPDATED, ['currency' => $currency->value, 'balance' => Points::decimal($balance), 'wallet_type' => $type->value]));
        };
        $push($exchange->user_id, Currency::CH, WalletType::Player);
        $push($exchange->user_id, Currency::KY, WalletType::Player);
        foreach ($exchange->shares()->whereNotNull('recipient_user_id')->pluck('recipient_user_id') as $id) {
            $push($id, Currency::CH, WalletType::Share);
        }
    }
}
