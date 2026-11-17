'use client';

import Link from 'next/link';
import { Ribbon } from '@/components/game';
import RoomTile from '@/components/RoomTile';
import { Notice, Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import type { Room } from '@/lib/types';

export default function Lobby() {
  const { user } = useAuth();
  const rooms = useFetch<{ data: Room[]; meta?: { announcement?: string | null; maintenance_message?: string | null } }>(user ? '/rooms' : null, { currency: 'VC' });

  return (
    <Screen title="Choose a table">
      {rooms.data?.meta?.maintenance_message && <Notice tone="warning">{rooms.data.meta.maintenance_message}</Notice>}
      {rooms.data?.meta?.announcement && (
        <div className="glass mb-4 flex items-center gap-3 rounded-2xl px-4 py-3">
          <span className="text-2xl">📣</span>
          <p className="text-sm font-semibold">{rooms.data.meta.announcement}</p>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <Ribbon tone="pink">Lobby</Ribbon>
        <Link href="/rooms/" className="font-display text-sm font-extrabold text-gold-300">
          Private &amp; all rooms ›
        </Link>
      </div>

      {rooms.loading && <Spinner />}
      {rooms.error && <Notice>{rooms.error}</Notice>}

      <div className="grid grid-cols-2 gap-3">
        {rooms.data?.data.map((room) => (
          <RoomTile key={room.id} room={room} />
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-white/55">4 players per table · your entry is held safely and refunded if you leave before the deal.</p>
    </Screen>
  );
}
