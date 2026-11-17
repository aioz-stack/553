import { useState, type FormEvent } from 'react';
import DataTable from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, statusTone, Textarea } from '../../Components/ui';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { percentFromBps, points, titleCase } from '../../lib/format';
import type { Room } from '../../lib/types';
import { useApi } from '../../lib/useApi';

const EMPTY = {
  name: '',
  description: '',
  currency: 'VC',
  entry_amount: '90',
  payout_mode: 'winner_takes_all',
  platform_fee_bps: '500',
  point_value: '',
  arrangement_seconds: '90',
  tie_handling: 'split_equally',
  timeout_policy: 'auto_arrange',
  allow_foul_submission: false,
  visibility: 'public',
  status: 'active',
};

/**
 * Game room management. Every table seats exactly four. Edits only affect
 * future games — each session stores a snapshot of the room configuration.
 */
export default function Rooms() {
  const { data, loading, reload } = useApi<{ data: Room[] }>('/admin/rooms');
  const [editing, setEditing] = useState<Room | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const edit = (room: Room | null) => {
    setEditing(room);
    setErrors({});
    setError(null);
    setForm(
      room
        ? {
            name: room.name,
            description: room.description ?? '',
            currency: room.currency,
            entry_amount: room.entry_amount,
            payout_mode: room.payout_mode,
            platform_fee_bps: String(room.platform_fee_bps),
            point_value: room.point_value ?? '',
            arrangement_seconds: String(room.arrangement_seconds),
            tie_handling: room.tie_handling,
            timeout_policy: room.timeout_policy,
            allow_foul_submission: room.allow_foul_submission,
            visibility: room.visibility,
            status: room.status,
          }
        : EMPTY,
    );
    setOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...form, platform_fee_bps: Number(form.platform_fee_bps), arrangement_seconds: Number(form.arrangement_seconds), point_value: form.point_value || null };
    try {
      if (editing) {
        await api.put(`/admin/rooms/${editing.id}`, payload);
      } else {
        await api.post('/admin/rooms', payload);
      }
      setOpen(false);
      reload();
    } catch (e) {
      setErrors(fieldErrors(e));
      setError(errorMessage(e));
    }
  };

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  return (
    <PageShell title="Game Rooms">
      <Card title="Rooms" subtitle="Payout mode is controlled here — players never choose it." actions={<Button onClick={() => edit(null)}>New room</Button>}>
        <DataTable<Room>
          loading={loading}
          rows={data?.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'name', label: 'Room', render: (r) => <span className="font-medium">{r.name}{r.visibility === 'private' && <> <Badge>private</Badge></>}</span> },
            { key: 'cur', label: 'Currency', render: (r) => <Badge tone={r.currency === 'VC' ? 'brand' : 'warning'}>{r.currency}</Badge> },
            { key: 'entry', label: 'Entry', align: 'right', render: (r) => points(r.entry_amount) },
            { key: 'mode', label: 'Payout', render: (r) => titleCase(r.payout_mode) },
            { key: 'fee', label: 'Fee', align: 'right', render: (r) => percentFromBps(r.platform_fee_bps) },
            { key: 'tie', label: 'Ties', render: (r) => titleCase(r.tie_handling) },
            { key: 'timer', label: 'Timer', align: 'right', render: (r) => `${r.arrangement_seconds}s` },
            { key: 'bank', label: 'Carry bank', align: 'right', render: (r) => points(r.carry_over) },
            { key: 'live', label: 'Live', render: (r) => `${r.waiting_players ?? 0} waiting · ${r.active_tables ?? 0} tables` },
            { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
            { key: 'act', label: '', align: 'right', render: (r) => <Button size="sm" variant="outline" onClick={() => edit(r)}>Edit</Button> },
          ]}
        />
      </Card>

      <Modal open={open} title={editing ? `Edit ${editing.name}` : 'New room'} onClose={() => setOpen(false)}>
        {error && <Alert>{error}</Alert>}
        <Alert tone="info">Tables always seat exactly 4 players. Changes apply to new games only.</Alert>
        <form onSubmit={save} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name" error={errors.name} required><Input value={form.name} onChange={set('name')} /></Field>
          <Field label="Currency" error={errors.currency}>
            <Select value={form.currency} onChange={set('currency')}>
              <option value="VC">VC (free-play)</option>
              <option value="CP">CP (disabled until approval)</option>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Description" error={errors.description}><Textarea value={form.description} onChange={set('description')} /></Field>
          </div>
          <Field label="Entry amount" error={errors.entry_amount} required><Input value={form.entry_amount} onChange={set('entry_amount')} /></Field>
          <Field label="Payout mode" error={errors.payout_mode}>
            <Select value={form.payout_mode} onChange={set('payout_mode')}>
              <option value="winner_takes_all">Winner takes all</option>
              <option value="round_bank">Round bank</option>
            </Select>
          </Field>
          <Field label="Platform fee (basis points)" error={errors.platform_fee_bps} hint={`${percentFromBps(Number(form.platform_fee_bps) || 0)} — WTA: of the pot; Round bank: of each winner's gain`}>
            <Input value={form.platform_fee_bps} onChange={set('platform_fee_bps')} inputMode="numeric" />
          </Field>
          <Field label="Round bank point value" error={errors.point_value} hint="Paid per scoring point. Max = entry ÷ 9. Blank = entry ÷ 9.">
            <Input value={form.point_value} onChange={set('point_value')} disabled={form.payout_mode !== 'round_bank'} />
          </Field>
          <Field label="Tie handling" error={errors.tie_handling} hint="Winner-takes-all ties for first place">
            <Select value={form.tie_handling} onChange={set('tie_handling')}>
              <option value="split_equally">Split equally</option>
              <option value="carry_forward">Carry forward to next game</option>
              <option value="tie_breaker">Tie-breaker (Back, Middle, Front)</option>
            </Select>
          </Field>
          <Field label="Arrangement timer (seconds)" error={errors.arrangement_seconds}><Input value={form.arrangement_seconds} onChange={set('arrangement_seconds')} inputMode="numeric" /></Field>
          <Field label="When the timer expires" error={errors.timeout_policy}>
            <Select value={form.timeout_policy} onChange={set('timeout_policy')}>
              <option value="auto_arrange">Auto-arrange missing hands</option>
              <option value="foul">Treat missing hands as fouls</option>
            </Select>
          </Field>
          <Field label="Visibility">
            <Select value={form.visibility} onChange={set('visibility')}>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.allow_foul_submission} onChange={(e) => setForm({ ...form, allow_foul_submission: e.target.checked })} />
            Allow players to submit fouled arrangements
          </label>
          <div className="md:col-span-2">
            <Button type="submit">{editing ? 'Save changes' : 'Create room'}</Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
