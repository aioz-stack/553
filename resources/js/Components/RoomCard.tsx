import { router } from '@inertiajs/react';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { percentFromBps, points, titleCase } from '../lib/format';
import type { Room, TableState } from '../lib/types';
import { Badge, Button } from './ui';

export async function joinRoom(roomId: number, inviteCode?: string): Promise<void> {
  const { data } = await api.post<{ data: TableState }>(`/rooms/${roomId}/join`, inviteCode ? { invite_code: inviteCode } : {});
  router.visit(`/play/${data.data.id}`);
}

export default function RoomCard({ room }: { room: Room }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await joinRoom(room.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">{room.name}</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">{room.description}</p>
        </div>
        <Badge tone="brand">Chips</Badge>
      </div>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-gray-500">Entry</dt>
        <dd className="text-right font-semibold text-gray-800 dark:text-white/90">{points(room.entry_amount, room.currency)}</dd>
        <dt className="text-gray-500">Payout</dt>
        <dd className="text-right text-gray-700 dark:text-gray-300">{titleCase(room.payout_mode)}</dd>
        <dt className="text-gray-500">Platform fee</dt>
        <dd className="text-right text-gray-700 dark:text-gray-300">{percentFromBps(room.platform_fee_bps)}</dd>
        <dt className="text-gray-500">Ties</dt>
        <dd className="text-right text-gray-700 dark:text-gray-300">{titleCase(room.tie_handling)}</dd>
        <dt className="text-gray-500">Timer</dt>
        <dd className="text-right text-gray-700 dark:text-gray-300">{room.arrangement_seconds}s</dd>
        {Number(room.carry_over) > 0 && (
          <>
            <dt className="text-gray-500">Carry-over bank</dt>
            <dd className="text-right font-semibold text-success-600">{points(room.carry_over, room.currency)}</dd>
          </>
        )}
        <dt className="text-gray-500">Waiting</dt>
        <dd className="text-right text-gray-700 dark:text-gray-300">{room.waiting_players ?? 0} players</dd>
      </dl>
      {error && <p className="mb-2 text-sm text-error-500">{error}</p>}
      <Button className="mt-auto" onClick={join} disabled={busy || !room.enabled}>
        {room.enabled ? (busy ? 'Joining…' : 'Join table') : 'Disabled (pending approval)'}
      </Button>
    </div>
  );
}
