import PageShell from '../../Components/PageShell';
import TransactionsTable from '../../Components/TransactionsTable';
import { Card } from '../../Components/ui';

export default function Transactions() {
  return (
    <PageShell title="Agent Transactions">
      <Card title="Ledger" subtitle="Allocations received, distributions to players, and commission payments. History cannot be edited.">
        <TransactionsTable endpoint="/agent/transactions" />
      </Card>
    </PageShell>
  );
}
