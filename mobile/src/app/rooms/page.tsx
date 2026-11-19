'use client';

import { useState } from 'react';
import { GameButton, GlassCard } from '@/components/game';
import RoomTile, { useJoin } from '@/components/RoomTile';
import { Field, Notice, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import type { Room } from '@/lib/types';

export default function Rooms() {
  const { user } = useAuth();
  const rooms = useFetch<{ data: Room[] }>(user ? '/rooms' : null);
  const join = useJoin();
  const [privateRoom, setPrivateRoom] = useState({ name: '', entry_amount: '100' });
  const [code, setCode] = useState({ room: '', code: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const create = async () => {
    try {
      const { data } = await api<{ data: Room }>('/rooms/private', { method: 'POST', body: privateRoom });
      setMessage({ tone: 'success', text: `Room #${data.id} created. Invite code ${data.invite_code}.` });
      rooms.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
    }
  };

  const joinPrivate = async () => {
    try {
      await join(Number(code.room), code.code);
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
    }
  };

  return (
    <Screen title="All rooms" back>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <p className="mb-4 text-center text-sm text-white/70">Every Multiplayer room plays for Chips.</p>

      <div className="mb-5 grid grid-cols-2 gap-3">
        {rooms.data?.data.map((room) => (
          <RoomTile key={room.id} room={room} />
        ))}
      </div>

      <GlassCard title="Join a private room">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Room #" inputMode="numeric" value={code.room} onChange={(e) => setCode({ ...code, room: e.target.value })} />
          <Field label="Invite code" autoCapitalize="characters" value={code.code} onChange={(e) => setCode({ ...code, code: e.target.value.toUpperCase() })} />
        </div>
        <GameButton tone="green" className="w-full" onClick={joinPrivate} disabled={!code.room}>JOIN</GameButton>
      </GlassCard>

      <GlassCard title="Create a private VC room">
        <Field label="Room name" value={privateRoom.name} onChange={(e) => setPrivateRoom({ ...privateRoom, name: e.target.value })} />
        <Field label="Entry (VC)" inputMode="decimal" value={privateRoom.entry_amount} onChange={(e) => setPrivateRoom({ ...privateRoom, entry_amount: e.target.value })} />
        <GameButton tone="purple" className="w-full" onClick={create} disabled={!privateRoom.name}>CREATE ROOM</GameButton>
      </GlassCard>
    </Screen>
  );
}
