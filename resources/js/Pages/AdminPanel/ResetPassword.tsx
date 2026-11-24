import { useEffect, useState } from 'react';
import { Btn, ConfirmDialog, Details, I, Note, Panel, SearchInput, StatusPill, Toast, TypePill, fieldClass, fmt, when, type ConfirmAction } from '../../Components/AdminPanel/kit';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api, errorMessage } from '../../lib/api';
import { usePanel } from '../../lib/panel';
import { useApi } from '../../lib/useApi';
import type { Account, PageMeta } from './types';

const strong = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/**
 * Admin Panel → Reset Password (Super Admin and Administrators only; the server checks again).
 * Find an Incorporator, Master Agent or Player by username, account ID, name or email,
 * check who it is, then set and confirm a new password. The password is hashed on the server,
 * never shown, and the reset is written to the audit log.
 */
export default function ResetPassword() {
  const panel = usePanel(); // Admin Panel or Loader Panel (same server rules: agents and players only)
  const initial = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('user')) || null : null;
  const [q, setQ] = useState('');
  const term = q.trim().replace(/^(PL|AG)-0*/i, '');
  const results = useApi<{ data: Account[]; meta: PageMeta }>(term ? `${panel.api}/accounts` : null, { kind: 'all', q: term || undefined, per_page: 8 });
  const [selected, setSelected] = useState<Account | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  // Opened from an account's "Reset Password" action.
  useEffect(() => {
    if (!initial) return;
    api.get<{ data: Account }>(`${panel.api}/accounts/${initial}`)
      .then((r) => setSelected(r.data.data))
      .catch((e) => setToast({ ok: false, text: errorMessage(e) }));
  }, [initial]);

  const pick = (a: Account) => {
    setSelected(a);
    setPassword('');
    setConfirmation('');
  };

  const problem = !password ? null : !strong(password) ? 'Use at least 8 characters with letters and numbers.' : confirmation && confirmation !== password ? 'The passwords do not match.' : null;
  const ready = !!selected && strong(password) && confirmation === password;

  const ask = () =>
    selected &&
    setConfirm({
      title: `Reset password · ${selected.username}`,
      message: (
        <>
          Set a new password for <b>{selected.username}</b> ({selected.account_type_label})? It works immediately, the old password stops working and any open sign-ins of this account are ended.
        </>
      ),
      confirm: 'Reset Password',
      variant: 'danger',
      run: async () => (await api.put<{ message: string }>(`${panel.api}/accounts/${selected.id}/password`, { password, password_confirmation: confirmation })).data.message,
    });

  return (
    <AdminPanelLayout title="Reset Password" subtitle="Set a new password for any Incorporator, Master Agent or Player">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Find an account" icon={<I.users className="h-6 w-6" />}>
          <div className="space-y-4 px-5 py-4">
            <SearchInput value={q} onChange={setQ} placeholder="Username, account ID (e.g. PL-000123), name or email…" />
            {!term && <p className="text-sm text-[#6b6385] dark:text-white/55">Search agents and players of every level and status.</p>}
            {term && results.loading && !results.data && <p className="text-sm text-[#6b6385] dark:text-white/55">Searching…</p>}
            {term && results.data && results.data.data.length === 0 && <p className="text-sm text-[#6b6385] dark:text-white/55">No agent or player matches “{q.trim()}”.</p>}
            <ul className="divide-y divide-[#f0ecf9] dark:divide-white/[0.06]">
              {term &&
                results.data?.data.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => pick(a)}
                      aria-pressed={selected?.id === a.id}
                      className={`flex w-full flex-wrap items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#f6f3fd] dark:hover:bg-white/[0.05] ${selected?.id === a.id ? 'bg-[#f3eeff] ring-1 ring-[#c4b5fd] dark:bg-white/[0.07]' : ''}`}
                    >
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block font-bold">{a.username}</span>
                        <span className="block font-mono text-[11px] text-[#857d9c] dark:text-white/45">
                          {a.account_id} · {a.name}
                        </span>
                      </span>
                      <TypePill type={a.account_type} label={a.account_type_label} />
                      <StatusPill status={a.status} />
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </Panel>

        <Panel title="New password" icon={<I.lock className="h-6 w-6" />}>
          <div className="space-y-4 px-5 py-4">
            {!selected ? (
              <p className="text-sm text-[#6b6385] dark:text-white/55">Choose an account first.</p>
            ) : (
              <>
                <Details
                  rows={[
                    ['Username', <b key="u">{selected.username}</b>],
                    ['Account ID', selected.account_id],
                    ['Name', selected.name],
                    ['Role', <TypePill key="t" type={selected.account_type} label={selected.account_type_label} />],
                    ['Status', <StatusPill key="s" status={selected.status} />],
                    ['Sponsor', selected.sponsor ? `${selected.sponsor.username} (${selected.sponsor.account_type_label})` : 'Direct'],
                    ['Chips', `${fmt(selected.chips, 2)} Chips`],
                    ['Registered', when(selected.registered_at)],
                  ]}
                />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ready) ask();
                  }}
                  className="space-y-3"
                >
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-[#3b3354] dark:text-white/80">New password</span>
                    <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} aria-label="New password" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-[#3b3354] dark:text-white/80">Confirm new password</span>
                    <input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={fieldClass} aria-label="Confirm new password" />
                  </label>
                  <p className={`text-xs ${problem ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-[#857d9c] dark:text-white/45'}`} role={problem ? 'alert' : undefined}>
                    {problem ?? 'At least 8 characters, with letters and numbers.'}
                  </p>
                  <div className="flex justify-end">
                    <Btn type="submit" variant="danger" disabled={!ready}>
                      <I.lock className="h-4 w-4" /> Reset Password
                    </Btn>
                  </div>
                </form>
              </>
            )}
          </div>
        </Panel>
      </div>
      <Note>
        <b>Note:</b> Existing passwords are never shown. Each reset is recorded in the audit log with who reset it, the account and the time. Admin accounts cannot be reset here.
      </Note>

      <ConfirmDialog
        action={confirm}
        onClose={() => setConfirm(null)}
        onDone={(m) => {
          setConfirm(null);
          setPassword('');
          setConfirmation('');
          setToast({ ok: true, text: m });
        }}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}
