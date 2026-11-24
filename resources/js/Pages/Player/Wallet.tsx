import PageShell from '../../Components/PageShell';
import { IconWallet } from '../../Components/PlatformIcons';
import TransactionsTable from '../../Components/TransactionsTable';
import { Alert, Card, StatCard } from '../../Components/ui';
import { points } from '../../lib/format';
import type { Wallet as WalletType } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export default function Wallet() {
  const { data } = useApi<{ data: WalletType[] }>('/wallet');
  const player = data?.data.filter((w) => w.type === 'player') ?? [];

  return (
    <PageShell title="Wallet">
      <Alert tone="info">
        Gold (Single Player) and Chips (Multiplayer) are separate wallets: they can never be combined, transferred or exchanged, and neither can be deposited, withdrawn or redeemed.
      </Alert>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
        {player.map((w) => (
          <StatCard
            key={w.id}
            icon={<IconWallet />}
            label={w.currency === 'CH' ? 'Chips (Multiplayer)' : 'Gold (Single Player)'}
            value={points(w.balance, w.currency)}
            hint={w.is_frozen ? 'Frozen' : w.currency === 'CH' ? 'Credited by your agent and Multiplayer winnings' : 'Won and lost in Single Player'}
          />
        ))}
      </div>
      <Card className="mt-6" title="Recent transactions">
        <TransactionsTable endpoint="/wallet/transactions" extraFilters={{ wallet_type: 'player', per_page: 10 }} />
      </Card>
    </PageShell>
  );
}
