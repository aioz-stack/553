<?php

namespace App\Console\Commands;

use App\Enums\AgentLevel;
use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\InsufficientBalanceException;
use App\Models\KeyExchangeShare;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Put an Incorporator under an Admin (Super Admin or Administrator): the Admin becomes its sponsor,
 * so from now on its players' Shop purchases pay the Admin share to that Admin.
 *
 * With --move-shop-shares, Admin shares already paid for that Incorporator's players to a
 * different Admin are moved too: a new ledger entry from the old Admin's Chips to the new Admin's
 * Chips (the original entry is kept), the share row and the exchange's hierarchy snapshot point
 * at the new Admin, and everything is audited. Safe to re-run.
 *
 *   php artisan pusoy:assign-admin agent admin --move-shop-shares
 */
#[Signature('pusoy:assign-admin {incorporator : Incorporator username} {admin : Admin username (Super Admin or Administrator)} {--move-shop-shares : Also move Shop Admin shares already paid for this Incorporator\'s players}')]
#[Description('Set an Incorporator\'s Admin (sponsor) and optionally move its past Shop Admin shares to that Admin')]
class AssignIncorporatorAdmin extends Command
{
    public function handle(LedgerService $ledger, WalletService $wallets): int
    {
        $inc = User::query()->with('agent')->where('username', $this->argument('incorporator'))->first();
        $admin = User::query()->where('username', $this->argument('admin'))->first();

        if (! $inc || ! $inc->isAgent() || $inc->agent?->level !== AgentLevel::Agent) {
            $this->error('The first account must be an Incorporator.');

            return self::FAILURE;
        }
        if (! $admin || ! ($admin->isSuperAdmin() || $admin->isAdministrator()) || ! $admin->isActive()) {
            $this->error('The second account must be an active Super Admin or Administrator.');

            return self::FAILURE;
        }

        if ($inc->sponsor_id !== $admin->id) {
            $old = $inc->sponsor_id;
            $inc->forceFill(['sponsor_id' => $admin->id])->save();
            AuditLogger::log(null, 'agent.admin_assigned', $inc, ['sponsor_id' => $old], ['sponsor_id' => $admin->id, 'admin' => $admin->username]);
            $this->info("{$inc->username} is now under {$admin->username}.");
        } else {
            $this->info("{$inc->username} was already under {$admin->username}.");
        }

        if (! $this->option('move-shop-shares')) {
            return self::SUCCESS;
        }

        $moved = 0;
        $chips = 0;
        $shares = KeyExchangeShare::query()->with('exchange')->where('role', 'admin')->where('recipient_user_id', '!=', $admin->id)->get()
            ->filter(fn (KeyExchangeShare $s) => collect($s->exchange?->hierarchy ?? [])->contains(fn ($h) => ($h['role'] ?? null) === 'incorporator' && ($h['user_id'] ?? null) === $inc->id));

        foreach ($shares as $share) {
            $from = User::query()->find($share->recipient_user_id);
            if (! $from) {
                continue;
            }

            try {
                DB::transaction(function () use ($share, $from, $admin, $ledger, $wallets) {
                    // Same kind of wallet the share was paid into (Revenue now; Chips for older shares).
                    $source = \App\Models\Wallet::query()->find($share->wallet_id) ?? $wallets->for($from, Currency::CH, WalletType::Allocation);
                    $to = $wallets->for($admin, Currency::CH, $source->type instanceof WalletType ? $source->type : WalletType::from($source->type));
                    $tx = $ledger->transfer(new TransferRequest(
                        type: TransactionType::KeyExchange,
                        currency: Currency::CH,
                        source: $source,
                        destination: $to,
                        amount: $share->amount,
                        reason: 'Shop: Admin share of exchange #'.$share->key_exchange_id.' moved from '.$from->username.' to '.$admin->username,
                        idempotencyKey: 'keyx-move:share:'.$share->id.':'.$admin->id,
                        relatedPlayerId: $share->exchange?->user_id,
                        metadata: ['exchange_id' => $share->key_exchange_id, 'role' => 'admin', 'from_user_id' => $from->id, 'moved_from_transaction_id' => $share->wallet_transaction_id],
                    ));

                    $old = ['recipient' => $from->username, 'wallet_id' => $share->wallet_id, 'wallet_transaction_id' => $share->wallet_transaction_id];
                    $share->forceFill(['recipient_user_id' => $admin->id, 'wallet_id' => $to->id, 'wallet_transaction_id' => $tx->id])->save();

                    $exchange = $share->exchange;
                    $path = collect($exchange->hierarchy ?? [])->reject(fn ($h) => ($h['role'] ?? null) === 'admin')->values()->all();
                    $path[] = ['role' => 'admin', 'user_id' => $admin->id, 'username' => $admin->username];
                    $exchange->forceFill(['hierarchy' => $path, 'upline_user_id' => $exchange->scenario === 'admin' ? $admin->id : $exchange->upline_user_id])->save();

                    AuditLogger::log(null, 'shop.share_moved_to_admin', $exchange, $old, ['recipient' => $admin->username, 'amount' => $share->amount, 'transaction' => $tx->reference]);
                });
                $moved++;
                $chips += $share->amount;
            } catch (InsufficientBalanceException) {
                $this->warn("Share #{$share->id}: {$from->username} no longer has those Chips; not moved.");
            }
        }

        $this->info("Moved {$moved} Shop Admin share(s), ".number_format($chips / 100, 2).' Chips, to '.$admin->username.'.');

        return self::SUCCESS;
    }
}
