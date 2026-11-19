import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import PageShell from '../../Components/PageShell';
import RoomCard from '../../Components/RoomCard';
import { Alert, Card, LinkButton, Spinner } from '../../Components/ui';
import { api } from '../../lib/api';
import type { Room, TableState } from '../../lib/types';
import { useApi } from '../../lib/useApi';

/**
 * Game lobby: resume an active seat, or jump into a featured Chips room.
 */
export default function Lobby() {
  const rooms = useApi<{ data: Room[]; meta?: { announcement?: string | null; maintenance_message?: string | null } }>('/rooms', { currency: 'CH' });
  const [seat, setSeat] = useState<TableState | null>(null);

  useEffect(() => {
    api.get<{ data: TableState | null }>('/tables/current').then((r) => setSeat(r.data.data)).catch(() => undefined);
  }, []);

  return (
    <PageShell title="Game Lobby">
      {rooms.data?.meta?.maintenance_message && <Alert tone="warning">{rooms.data.meta.maintenance_message}</Alert>}
      {rooms.data?.meta?.announcement && <Alert tone="info">{rooms.data.meta.announcement}</Alert>}
      {seat && (
        <Alert tone="info">
          You already have a seat at <strong>{seat.room.name}</strong>.{' '}
          <button className="font-semibold underline" onClick={() => router.visit(`/play/${seat.id}`)}>
            Go to table #{seat.id}
          </button>
        </Alert>
      )}

      <Card
        title="Play Pusoy 13"
        subtitle="Four players per table. Your entry is held safely until the game settles, and refunded if you leave before the deal."
        actions={<LinkButton href="/rooms" variant="outline">All rooms & private tables</LinkButton>}
      >
        {rooms.loading && <Spinner />}
        {rooms.error && <Alert>{rooms.error}</Alert>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rooms.data?.data.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      </Card>
    </PageShell>
  );
}
