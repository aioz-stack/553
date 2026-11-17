import { useState } from 'react';
import RevealBoard from '../../Components/Game/RevealBoard';
import PageShell from '../../Components/PageShell';
import TransactionsTable from '../../Components/TransactionsTable';
import { Alert, Badge, Button, Card, Spinner, statusTone } from '../../Components/ui';
import { api, errorMessage } from '../../lib/api';
import { points, titleCase } from '../../lib/format';
import type { SessionState } from '../../lib/types';
import { useApi } from '../../lib/useApi';

interface Settlement {
  status: string;
  attempts: number;
  last_error: string | null;
  platform_fee: number;
  payout_total: number;
  carry_in: number;
  carry_out: number;
}

export default function SessionDetail({ sessionId }: { sessionId: number }) {
  const { data, reload, error } = useApi<{ data: SessionState & { settlement: Settlement | null } }>(`/admin/games/${sessionId}`);
  const [message, setMessage] = useState<string | null>(null);
  const s = data?.data;

  const act = async (path: string, body?: object) => {
    try {
      await api.post(path, body);
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  if (!s) {
    return <PageShell title={`Game #${sessionId}`}>{error ? <Alert>{error}</Alert> : <Spinner />}</PageShell>;
  }

  const final = ['COMPLETED', 'CANCELLED'].includes(s.status);

  return (
    <PageShell title={`Game #${sessionId}`}>
      {message && <Alert>{message}</Alert>}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(s.status)}>{titleCase(s.status)}</Badge>
        <Badge>{s.config.room_name}</Badge>
        <Badge>{titleCase(s.config.payout_mode)}</Badge>
        <Badge>Pot {points(s.pot, s.config.currency)}</Badge>
        {!final && (
          <>
            <Button size="sm" variant="outline" onClick={() => act(`/admin/games/${sessionId}/retry`)}>Retry resolution</Button>
            <Button size="sm" variant="danger" onClick={() => { const r = prompt('Cancellation reason (all entries refunded):'); if (r) act(`/admin/games/${sessionId}/cancel`, { reason: r }); }}>Cancel game</Button>
          </>
        )}
      </div>

      {s.settlement && (
        <Card className="mb-6" title="Settlement">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
            <div><p className="text-gray-500">Status</p><Badge tone={statusTone(s.settlement.status)}>{s.settlement.status}</Badge></div>
            <div><p className="text-gray-500">Attempts</p>{s.settlement.attempts}</div>
            <div><p className="text-gray-500">Payouts</p>{points(s.settlement.payout_total / 100)}</div>
            <div><p className="text-gray-500">Platform fee</p>{points(s.settlement.platform_fee / 100)}</div>
            <div><p className="text-gray-500">Carry in</p>{points(s.settlement.carry_in / 100)}</div>
            <div><p className="text-gray-500">Carry out</p>{points(s.settlement.carry_out / 100)}</div>
          </div>
          {s.settlement.last_error && <Alert>{s.settlement.last_error}</Alert>}
        </Card>
      )}

      <Card title="Players & arrangements" subtitle="Private cards are never shown to staff before the reveal stage.">
        {s.arrangements ? (
          <RevealBoard arrangements={s.arrangements} results={s.results} currency={s.config.currency} />
        ) : (
          <ul className="text-sm">
            {s.players.map((p) => (
              <li key={p.user_id}>
                Seat {p.seat}: {p.name} — {p.has_submitted ? 'submitted' : 'arranging'} {p.is_connected ? '' : '(offline)'}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6" title="Fairness">
        <p className="break-all text-xs">Commitment: {s.deck_commitment}</p>
        <p className="mt-1 break-all text-xs">Seed: {s.server_seed ?? 'hidden until the game ends'}</p>
      </Card>

      <Card className="mt-6" title="Ledger entries for this game">
        <TransactionsTable endpoint="/admin/transactions" staff extraFilters={{ game_session_id: sessionId }} />
      </Card>
    </PageShell>
  );
}
