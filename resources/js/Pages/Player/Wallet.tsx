import PageShell from '../../Components/PageShell';
import { IconWallet } from '../../Components/PlatformIcons';
import TransactionsTable from '../../Components/TransactionsTable';
import { Alert, Card, StatCard } from '../../Components/ui';
import { points } from '../../lib/format';
import type { Wallet as WalletType } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export default function Wallet() {
  const { data } = useApi<{ data: WalletType[]; meta: { cash_deposits_enabled: boolean; cash_withdrawals_enabled: boolean } }>('/wallet');
  const player = data?.data.filter((w) => w.type === 'player') ?? [];

  return (
    <PageShell title="Wallet">
      <Alert tone="info">
        CP and VC are separate wallets and can never be combined or converted. VC is free-play only and cannot be withdrawn or redeemed.
        {data && !data.meta.cash_withdrawals_enabled && ' Cash deposits, withdrawals and redemption are disabled pending regulatory approval.'}
      </Alert>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
        {player.map((w) => (
          <StatCard
            key={w.id}
            icon={<IconWallet />}
            label={w.currency === 'VC' ? 'Virtual Coins (VC)' : 'Cash Points (CP)'}
            value={points(w.balance, w.currency)}
            hint={w.is_frozen ? 'Frozen' : w.currency === 'VC' ? 'Credited by your agent, daily rewards and game winnings' : 'PHP-denominated accounting points'}
          />
        ))}
      </div>
      <Card className="mt-6" title="Recent transactions">
        <TransactionsTable endpoint="/wallet/transactions" extraFilters={{ wallet_type: 'player', per_page: 10 }} />
      </Card>
    </PageShell>
  );
}
