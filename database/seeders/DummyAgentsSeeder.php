<?php

namespace Database\Seeders;

use App\Console\Commands\CreateSuperAdmin;
use App\Enums\CommissionStatus;
use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Models\AgentCommission;
use App\Models\User;
use App\Services\Users\ReferralService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * TESTING ONLY — never runs in production and is not part of DatabaseSeeder.
 *
 *   php artisan db:seed --class=DummyAgentsSeeder
 *
 * Creates a dummy agent chain under the Super Admin through the real referral + approval flow
 * (password for all: "password"):
 *
 *   dummyagent    Incorporator   (sponsor: superadmin)
 *   dummymaster   Master Agent   (sponsor: dummyagent)
 *   dummyplayer   Player         (sponsor: dummymaster)
 *
 * (Databases seeded before Silver Agent was removed also have dummysilver, now a Master Agent
 * under dummyagent with dummyplayer as its player.)
 *
 * Each dummy agent gets 200 Chips of commission: a Paid commission record plus the matching
 * ledger credit into its commission wallet, so "Convert Commission to Wallet", Team Overview
 * and Commission Logs all have data. Re-running never duplicates an account or a credit.
 */
class DummyAgentsSeeder extends Seeder
{
    public const COMMISSION_MINOR = 200_00;

    /** Marker session id for dummy commissions (no real game). */
    public const DUMMY_SESSION = 0;

    public function run(ReferralService $referrals, LedgerService $ledger, WalletService $wallets): void
    {
        if (app()->isProduction()) {
            throw new RuntimeException('DummyAgentsSeeder is for local testing only.');
        }

        $find = fn (string $username) => User::query()->where('username', $username)->first();
        $super = $find('superadmin') ?? CreateSuperAdmin::bootstrap('Super Admin', 'superadmin', 'superadmin@pusoy.test', 'password');

        $join = function (User $sponsor, string $type, string $username, string $name) use ($find, $referrals, $super): User {
            if ($user = $find($username)) {
                return $user;
            }
            $user = $referrals->register(['name' => $name, 'username' => $username, 'email' => "{$username}@pusoy.test", 'password' => 'password'], $referrals->codeFor($sponsor), $type);

            return $referrals->approve($super, $user);
        };

        $agent = $join($super, 'agent', 'dummyagent', 'Dummy Agent');
        $master = $join($agent, 'agent', 'dummymaster', 'Dummy Master Agent');
        $player = $join($master, 'player', 'dummyplayer', 'Dummy Player');

        foreach ([$agent, $master] as $user) {
            $user->loadMissing('agent');
            $commission = AgentCommission::query()->firstOrCreate(
                ['agent_id' => $user->agent->id, 'game_session_id' => self::DUMMY_SESSION, 'player_id' => $player->id],
                ['currency' => Currency::CH->value, 'fee_basis' => self::COMMISSION_MINOR, 'rate_bps' => 10000, 'amount' => self::COMMISSION_MINOR, 'status' => CommissionStatus::Pending, 'note' => 'Dummy test commission'],
            );

            if ($commission->status === CommissionStatus::Paid) {
                continue;
            }

            // Issued (null source) so the ledger stays reconciled without touching the platform wallet.
            $transaction = $ledger->transfer(new TransferRequest(
                type: TransactionType::CommissionPayment,
                currency: Currency::CH,
                source: null,
                destination: $wallets->for($user, Currency::CH, WalletType::Commission),
                amount: self::COMMISSION_MINOR,
                reason: 'Dummy test commission',
                actor: $super,
                idempotencyKey: "dummy-commission:{$user->id}",
                relatedPlayerId: $player->id,
                relatedAgentId: $user->id,
                approvedBy: $super->id,
            ));

            $commission->forceFill(['status' => CommissionStatus::Paid, 'reviewed_by' => $super->id, 'reviewed_at' => now(), 'payment_transaction_id' => $transaction->id])->save();
        }
    }
}
