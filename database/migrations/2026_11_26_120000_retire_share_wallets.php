<?php

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Models\User;
use App\Models\Wallet;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The "Share Amount / Convert to Chips" feature was removed before it was released. Databases
 * that ran it (local development only) can still hold Share wallets with a balance: move each
 * balance into the same person's Chips wallet with a ledger entry (nothing is lost; the ledger
 * stays reconciled) and audit it, then drop the unused share_conversions table and the deleted
 * migration's record. On databases that never had the feature this does nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        $ledger = app(LedgerService::class);
        $wallets = app(WalletService::class);

        foreach (Wallet::query()->where('type', WalletType::Share->value)->where('balance', '>', 0)->get() as $share) {
            $user = User::query()->find($share->user_id);
            if (! $user) {
                continue;
            }

            DB::transaction(function () use ($share, $user, $ledger, $wallets) {
                $tx = $ledger->transfer(new TransferRequest(
                    type: TransactionType::ShareConversion,
                    currency: Currency::CH,
                    source: $share,
                    destination: $wallets->for($user, Currency::CH, WalletType::Allocation),
                    amount: $share->balance,
                    reason: 'Retired Share Amount moved to Chips',
                    idempotencyKey: 'share-retire:'.$share->id,
                    relatedPlayerId: null,
                    relatedAgentId: $user->isAgent() ? $user->id : null,
                ));
                AuditLogger::log(null, 'share.retired_to_chips', $user, ['share' => $share->balance], ['moved' => $share->balance, 'reference' => $tx->reference]);
            });
        }

        Schema::dropIfExists('share_conversions');
        DB::table('migrations')->where('migration', '2026_11_26_100000_create_share_conversions_table')->delete();
    }

    public function down(): void
    {
        // Not reversible: the moves are in the ledger and the audit log.
    }
};
