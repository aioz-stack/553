'use client';

import Link from 'next/link';
import RoomTile from '@/components/RoomTile';
import { Notice, Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import type { Room } from '@/lib/types';

export default function Lobby() {
  const { user } = useAuth();
  const rooms = useFetch<{ data: Room[]; meta?: { announcement?: string | null; maintenance_message?: string | null } }>(user ? '/rooms' : null, { currency: 'VC' });

  return (
    <Screen title="Lobby" action={<Link href="/rooms/" className="text-sm text-brand-300">All rooms</Link>}>
      {rooms.data?.meta?.maintenance_message && <Notice tone="warning">{rooms.data.meta.maintenance_message}</Notice>}
      {rooms.data?.meta?.announcement && <Notice tone="info">{rooms.data.meta.announcement}</Notice>}
      <Notice tone="info">Four players per table. Your entry is held until the game settles and refunded if you leave before the deal.</Notice>
      {rooms.loading && <Spinner />}
      {rooms.error && <Notice>{rooms.error}</Notice>}
      {rooms.data?.data.map((room) => <RoomTile key={room.id} room={room} />)}
    </Screen>
  );
}
