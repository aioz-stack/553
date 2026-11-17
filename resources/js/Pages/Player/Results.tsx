import RevealBoard from '../../Components/Game/RevealBoard';
import PageShell from '../../Components/PageShell';
import { Alert, Card, LinkButton, Spinner } from '../../Components/ui';
import type { SessionState } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export default function Results({ sessionId }: { sessionId: number }) {
  const { data, error, loading } = useApi<{ data: SessionState }>(`/games/${sessionId}`);
  const s = data?.data;

  return (
    <PageShell title={`Game #${sessionId} results`}>
      {loading && <Spinner />}
      {error && <Alert>{error}</Alert>}
      {s && (
        <>
          {s.status !== 'COMPLETED' && <Alert tone="warning">This game is {s.status.toLowerCase()}.</Alert>}
          <Card title={s.config.room_name} subtitle={`Pot ${s.pot} ${s.config.currency} · ${s.config.payout_mode.replace(/_/g, ' ')}`} actions={<LinkButton href="/lobby">Play again</LinkButton>}>
            {s.arrangements ? <RevealBoard arrangements={s.arrangements} results={s.results} currency={s.config.currency} /> : <p className="text-sm text-gray-500">Arrangements are revealed when everyone has submitted.</p>}
          </Card>
          <Card className="mt-6" title="Verify the shuffle">
            <p className="break-all text-xs text-gray-500 dark:text-gray-400">Commitment: {s.deck_commitment}</p>
            <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">Seed: {s.server_seed ?? 'revealed after the game completes'}</p>
          </Card>
        </>
      )}
    </PageShell>
  );
}
