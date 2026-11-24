<?php

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Models\KeyExchangeShare;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\KeyExchangeService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Shop exchanges made before the Admin lookup was fixed paid the Admin's share into the platform's
 * Chips wallet when the Incorporator had no recorded sponsor. Move each such share to the right
 * Admin's Chips wallet with a new ledger entry (the original entry is kept), point the share row
 * at the Admin, and audit it. Safe to re-run (idempotency key per share).
 */
return new class extends Migration
{
    public function up(): void
    {
        $shop = app(KeyExchangeService::class);
        $ledger = app(LedgerService::class);
        $wallets = app(WalletService::class);

        foreach (KeyExchangeShare::query()->with('exchange.user')->where('role', 'platform')->get() as $share) {
            $player = $share->exchange?->user;
            $admin = $player ? ($shop->hierarchy($player)['admin'] ?? null) : $shop->platformAdmin();
            if ($admin === null) {
                continue; // no Super Admin at all: leave it with the platform
            }

            DB::transaction(function () use ($share, $admin, $ledger, $wallets) {
                $adminWallet = $wallets->for($admin, Currency::CH, WalletType::Allocation);
                $tx = $ledger->transfer(new TransferRequest(
                    type: TransactionType::KeyExchange,
                    currency: Currency::CH,
                    source: $wallets->platform(Currency::CH),
                    destination: $adminWallet,
                    amount: $share->amount,
                    reason: 'Shop: Admin share of exchange #'.$share->key_exchange_id.' (moved from the platform wallet)',
                    idempotencyKey: 'keyx-fix:share:'.$share->id,
                    relatedPlayerId: $share->exchange?->user_id,
                    metadata: ['exchange_id' => $share->key_exchange_id, 'role' => 'admin', 'moved_from_transaction_id' => $share->wallet_transaction_id],
                ));

                $old = ['role' => 'platform', 'wallet_id' => $share->wallet_id, 'wallet_transaction_id' => $share->wallet_transaction_id];
                // Another admin share in the same exchange? Merge into it (one row per role).
                $existing = KeyExchangeShare::query()->where('key_exchange_id', $share->key_exchange_id)->where('role', 'admin')->first();
                if ($existing) {
                    $existing->forceFill(['amount' => $existing->amount + $share->amount, 'percent_bps' => $existing->percent_bps + $share->percent_bps])->save();
                    $share->delete();
                } else {
                    $share->forceFill(['role' => 'admin', 'recipient_user_id' => $admin->id, 'wallet_id' => $adminWallet->id, 'wallet_transaction_id' => $tx->id])->save();
                }

                $exchange = $share->exchange;
                $path = $exchange->hierarchy ?? [];
                if (! collect($path)->contains('role', 'admin')) {
                    $path[] = ['role' => 'admin', 'user_id' => $admin->id, 'username' => $admin->username];
                    $exchange->forceFill(['hierarchy' => $path])->save();
                }

                AuditLogger::log(null, 'shop.share_moved_to_admin', $exchange, $old, ['role' => 'admin', 'recipient' => $admin->username, 'amount' => $share->amount, 'transaction' => $tx->reference]);
            });
        }
    }

    public function down(): void
    {
        // Not reversed: the move is recorded in the ledger and the audit log.
    }
};
