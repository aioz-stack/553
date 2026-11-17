'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { points, titleCase } from '@/lib/hooks';
import type { Room, TableState } from '@/lib/types';
import { Badge, Button } from './ui';

export function useJoin() {
  const router = useRouter();

  return async (roomId: number, inviteCode?: string) => {
    const { data } = await api<{ data: TableState }>(`/rooms/${roomId}/join`, { method: 'POST', body: inviteCode ? { invite_code: inviteCode } : {} });
    router.push(`/play/?table=${data.id}`);
  };
}

export default function RoomTile({ room }: { room: Room }) {
  const join = useJoin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onJoin = async () => {
    setBusy(true);
    setError(null);
    try {
      await join(room.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{room.name}</h3>
          <p className="text-xs text-gray-500">{room.description}</p>
        </div>
        <Badge tone={room.currency === 'VC' ? 'brand' : 'warning'}>{room.currency}</Badge>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
        <Badge>Entry {points(room.entry_amount)}</Badge>
        <Badge>{titleCase(room.payout_mode)}</Badge>
        <Badge>{room.arrangement_seconds}s</Badge>
        <Badge>{room.waiting_players ?? 0} waiting</Badge>
        {Number(room.carry_over) > 0 && <Badge tone="success">Bank {points(room.carry_over)}</Badge>}
      </div>
      {error && <p className="mb-2 text-xs text-error-500">{error}</p>}
      <Button className="w-full" onClick={onJoin} disabled={busy || !room.enabled}>
        {room.enabled ? (busy ? 'Joining…' : 'Join table') : 'Disabled pending approval'}
      </Button>
    </div>
  );
}
