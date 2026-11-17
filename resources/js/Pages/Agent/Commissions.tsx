import CommissionsTable from '../../Components/CommissionsTable';
import PageShell from '../../Components/PageShell';
import { Card } from '../../Components/ui';

export default function Commissions() {
  return (
    <PageShell title="Commissions">
      <Card title="Commission earnings" subtitle="Generated only from completed games. Approval and payouts are handled by the platform; cash payouts are disabled.">
        <CommissionsTable endpoint="/agent/commissions" />
      </Card>
    </PageShell>
  );
}
