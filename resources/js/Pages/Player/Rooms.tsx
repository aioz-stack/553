import { useState, type FormEvent } from 'react';
import PageShell from '../../Components/PageShell';
import RoomCard, { joinRoom } from '../../Components/RoomCard';
import { Alert, Button, Card, Field, Input, Spinner, Tabs } from '../../Components/ui';
import { api, errorMessage } from '../../lib/api';
import type { Room } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export default function Rooms() {
  const [currency, setCurrency] = useState<'' | 'VC' | 'CP'>('');
  const rooms = useApi<{ data: Room[] }>('/rooms', { currency: currency || undefined });
  const [form, setForm] = useState({ name: '', entry_amount: '100' });
  const [invite, setInvite] = useState({ room_id: '', code: '', username: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const createPrivate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { data } = await api.post<{ data: Room }>('/rooms/private', form);
      setMessage({ tone: 'success', text: `Private room created. Share invite code ${data.data.invite_code} (room #${data.data.id}).` });
      rooms.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  const joinPrivate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await joinRoom(Number(invite.room_id), invite.code);
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  const sendInvite = async () => {
    try {
      await api.post(`/rooms/${invite.room_id}/invite`, { username: invite.username });
      setMessage({ tone: 'success', text: `Invitation sent to ${invite.username}.` });
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <PageShell title="Game Rooms">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card
        title="Rooms"
        subtitle="Payout rules are set by the platform for each room."
        actions={
          <Tabs
            value={currency}
            onChange={setCurrency}
            options={[
              { value: '', label: 'All' },
              { value: 'VC', label: 'VC' },
              { value: 'CP', label: 'CP' },
            ]}
          />
        }
      >
        {rooms.loading && <Spinner />}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rooms.data?.data.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Create a private VC room" subtitle="Fee-free table for friends. Players cannot choose payout modes.">
          <form onSubmit={createPrivate} className="space-y-4">
            <Field label="Room name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Entry (VC)" required>
              <Input value={form.entry_amount} onChange={(e) => setForm({ ...form, entry_amount: e.target.value })} inputMode="decimal" />
            </Field>
            <Button type="submit">Create room</Button>
          </form>
        </Card>

        <Card title="Join or invite to a private room">
          <form onSubmit={joinPrivate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Room #" required>
                <Input value={invite.room_id} onChange={(e) => setInvite({ ...invite, room_id: e.target.value })} inputMode="numeric" />
              </Field>
              <Field label="Invite code">
                <Input value={invite.code} onChange={(e) => setInvite({ ...invite, code: e.target.value.toUpperCase() })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">Join</Button>
            </div>
            <Field label="Invite a player by username (room owners)">
              <div className="flex gap-2">
                <Input value={invite.username} onChange={(e) => setInvite({ ...invite, username: e.target.value })} />
                <Button type="button" variant="outline" onClick={sendInvite} disabled={!invite.room_id || !invite.username}>
                  Invite
                </Button>
              </div>
            </Field>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
