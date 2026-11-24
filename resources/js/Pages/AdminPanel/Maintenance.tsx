import { useState } from 'react';
import { ConfirmDialog, I, Panel, Toast, when, type ConfirmAction } from '../../Components/AdminPanel/kit';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api } from '../../lib/api';
import { MODE_EFFECTS, type MaintenanceModeValue, type MaintenanceStatus } from '../../lib/maintenance';
import { usePanelRefresh } from '../../lib/panel';
import { useApi } from '../../lib/useApi';

interface Data {
  data: MaintenanceStatus;
  meta: { history: Array<{ from: string | null; to: string | null; by: string | null; at: string | null }> };
}

const MODES: Array<{ value: MaintenanceModeValue; title: string; tone: string; affects: string[] }> = [
  {
    value: 'full',
    title: 'Full Maintenance',
    tone: 'from-rose-500 to-red-700',
    affects: ['Player Mobile Game closed — full-screen maintenance artwork, landscape', 'Matchmaking, table entry and gameplay blocked', 'All Agent, Master Agent, Silver Agent and Player transactions disabled', 'Panels stay viewable'],
  },
  {
    value: 'mobile_game',
    title: 'Mobile Game',
    tone: 'from-violet-500 to-purple-700',
    affects: ['Player Mobile Game closed — full-screen maintenance artwork, landscape', 'Matchmaking, table entry and gameplay blocked', 'Admin, Agent and Player panels and transactions keep working'],
  },
  {
    value: 'agents_players',
    title: 'Agents/Players',
    tone: 'from-amber-400 to-orange-600',
    affects: ['Transactions of Agents, Master Agents, Silver Agents and Players disabled (Load / Withdraw Chips, requests, commission conversion and withdrawals)', 'Panels stay available with a maintenance notice', 'The mobile game keeps running'],
  },
  {
    value: 'off',
    title: 'OFF',
    tone: 'from-emerald-400 to-green-700',
    affects: ['Normal operation', 'Mobile game, matchmaking and gameplay open', 'All transactions restored'],
  },
];

const label = (v: string | null) => MODES.find((m) => m.value === v)?.title ?? v ?? '—';

/**
 * Admin Panel → Maintenance (Super Admin and Administrators only; the server checks again).
 * One mode at a time; the change applies at once on the server, reaches open panels and apps
 * through Reverb (and their periodic check), and is written to the audit log.
 */
export default function Maintenance() {
  const { data, reload } = useApi<Data>('/admin/maintenance');
  usePanelRefresh(reload);
  const current = data?.data;
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const choose = (m: (typeof MODES)[number]) =>
    setConfirm({
      title: m.value === 'off' ? 'Turn maintenance OFF' : `Activate ${m.title}`,
      message: (
        <div className="space-y-2">
          <p>{MODE_EFFECTS[m.value]}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {m.affects.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="text-xs text-[#857d9c] dark:text-white/45">Applies immediately for everyone. Balances, history and commissions are not changed.</p>
        </div>
      ),
      confirm: m.value === 'off' ? 'Turn OFF' : `Activate ${m.title}`,
      variant: m.value === 'off' ? 'success' : 'danger',
      run: async () => (await api.put<{ message: string }>('/admin/maintenance', { mode: m.value })).data.message,
    });

  return (
    <AdminPanelLayout title="Maintenance" subtitle="Control maintenance for the mobile game and agent / player transactions">
      <Panel
        title="Current status"
        icon={<I.shield className="h-6 w-6" />}
        actions={current && <span className="text-sm text-[#6b6385] dark:text-white/55">Since {when(current.changed_at)}</span>}
      >
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-black text-white shadow ${current?.mode === 'off' ? 'bg-emerald-600' : 'bg-rose-600'}`} aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full bg-white ${current && current.mode !== 'off' ? 'animate-pulse' : ''}`} />
            {current ? (current.mode === 'off' ? 'OFF — normal operation' : current.label) : '…'}
          </span>
          {current && (
            <span className="text-sm text-[#5b5274] dark:text-white/65">
              Mobile game: <b>{current.game_blocked ? 'closed' : 'open'}</b> · Agent / player transactions: <b>{current.transactions_blocked ? 'disabled' : 'enabled'}</b>
            </span>
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {MODES.map((m) => {
          const active = current?.mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              disabled={!current || active}
              onClick={() => choose(m)}
              aria-pressed={active}
              className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition disabled:cursor-default ${
                active ? 'border-transparent ring-4 ring-[#f5c542]/70' : 'border-[#e7e1f6] hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10'
              } bg-white dark:bg-white/[0.03]`}
            >
              <span className={`mb-3 inline-flex rounded-xl bg-gradient-to-br ${m.tone} px-3 py-1 text-sm font-black uppercase tracking-wide text-white`}>{m.title}</span>
              {active && <span className="absolute right-4 top-4 rounded-full bg-[#f5c542] px-2.5 py-0.5 text-xs font-black text-[#3b2400]">ACTIVE</span>}
              <p className="text-sm text-[#3b3354] dark:text-white/80">{MODE_EFFECTS[m.value]}</p>
              <ul className="mt-3 space-y-1 text-xs text-[#6b6385] dark:text-white/55">
                {m.affects.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span aria-hidden>•</span>
                    {a}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <Panel title="Recent changes" icon={<I.clock className="h-6 w-6" />}>
        <ul className="divide-y divide-[#f0ecf9] text-sm dark:divide-white/[0.06]">
          {(data?.meta.history ?? []).length === 0 && <li className="px-5 py-4 text-[#857d9c] dark:text-white/45">No changes yet.</li>}
          {data?.meta.history.map((h, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="w-40 shrink-0 text-xs text-[#857d9c] dark:text-white/45">{when(h.at)}</span>
              <span>
                {label(h.from)} → <b>{label(h.to)}</b>
              </span>
              <span className="ml-auto text-xs text-[#6b6385] dark:text-white/55">by {h.by ?? '—'}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <ConfirmDialog
        action={confirm}
        onClose={() => setConfirm(null)}
        onDone={(msg) => {
          setConfirm(null);
          setToast({ ok: true, text: msg });
          reload();
          window.dispatchEvent(new Event('pusoy:panel-refresh'));
        }}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}
