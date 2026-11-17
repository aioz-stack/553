<?php

namespace App\Console\Commands;

use App\Services\Wallet\WalletService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('pusoy:reconcile')]
#[Description('Verify every wallet balance against the ledger and escrow against holds + room banks')]
class ReconcileLedger extends Command
{
    public function handle(WalletService $wallets): int
    {
        $report = $wallets->reconcile();

        $this->info("Wallets checked: {$report['wallets_checked']}");

        foreach ($report['escrow'] as $currency => $row) {
            $this->line("Escrow {$currency}: balance={$row['balance']} expected={$row['expected']}");
        }

        if (! $report['ok']) {
            $this->error('Mismatches found:');
            $this->table(['detail'], array_map(fn ($m) => [json_encode($m)], $report['mismatches']));

            return self::FAILURE;
        }

        $this->info('Ledger is balanced.');

        return self::SUCCESS;
    }
}
