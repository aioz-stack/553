'use client';

import { useState } from 'react';
import RoomTile, { useJoin } from '@/components/RoomTile';
import { Button, Field, Notice, Panel, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import type { Room } from '@/lib/types';

export default function Rooms() {
  const { user } = useAuth();
  const [currency, setCurrency] = useState<'' | 'VC' | 'CP'>('');
  const rooms = useFetch<{ data: Room[] }>(user ? '/rooms' : null, { currency: currency || undefined });
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
    <Screen title="Game rooms" back>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="mb-4 flex gap-2">
        {(['', 'VC', 'CP'] as const).map((c) => (
          <button key={c} onClick={() => setCurrency(c)} className={`h-10 flex-1 rounded-xl text-sm font-medium ${currency === c ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 dark:bg-gray-900'}`}>
            {c || 'All'}
          </button>
        ))}
      </div>
      {rooms.data?.data.map((room) => <RoomTile key={room.id} room={room} />)}

      <Panel title="Join a private room">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Room #" inputMode="numeric" value={code.room} onChange={(e) => setCode({ ...code, room: e.target.value })} />
          <Field label="Invite code" autoCapitalize="characters" value={code.code} onChange={(e) => setCode({ ...code, code: e.target.value.toUpperCase() })} />
        </div>
        <Button className="w-full" onClick={joinPrivate} disabled={!code.room}>Join</Button>
      </Panel>

      <Panel title="Create a private VC room">
        <Field label="Room name" value={privateRoom.name} onChange={(e) => setPrivateRoom({ ...privateRoom, name: e.target.value })} />
        <Field label="Entry (VC)" inputMode="decimal" value={privateRoom.entry_amount} onChange={(e) => setPrivateRoom({ ...privateRoom, entry_amount: e.target.value })} />
        <Button className="w-full" variant="outline" onClick={create} disabled={!privateRoom.name}>Create</Button>
      </Panel>
    </Screen>
  );
}
