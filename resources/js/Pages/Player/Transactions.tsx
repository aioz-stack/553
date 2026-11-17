import PageShell from '../../Components/PageShell';
import TransactionsTable from '../../Components/TransactionsTable';
import { Card } from '../../Components/ui';

export default function Transactions() {
  return (
    <PageShell title="Transactions">
      <Card title="Transaction history" subtitle="Every credit and debit is an immutable ledger entry. Corrections appear as reversals.">
        <TransactionsTable endpoint="/wallet/transactions" />
      </Card>
    </PageShell>
  );
}
