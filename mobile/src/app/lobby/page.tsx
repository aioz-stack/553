'use client';

import Link from 'next/link';
import RoomTile from '@/components/RoomTile';
import { Notice, Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import type { Room } from '@/lib/types';

export default function Lobby() {
  const { user } = useAuth();
  const rooms = useFetch<{ data: Room[] }>(user ? '/rooms' : null, { currency: 'VC' });

  return (
    <Screen title="Lobby" action={<Link href="/rooms/" className="text-sm text-brand-300">All rooms</Link>}>
      <Notice tone="info">Four players per table. Your entry is held until the game settles and refunded if you leave before the deal.</Notice>
      {rooms.loading && <Spinner />}
      {rooms.error && <Notice>{rooms.error}</Notice>}
      {rooms.data?.data.map((room) => <RoomTile key={room.id} room={room} />)}
    </Screen>
  );
}
