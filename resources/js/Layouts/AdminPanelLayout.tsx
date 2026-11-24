import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEffect, useState, type ReactNode } from 'react';
import { I, Crown } from '../Components/AdminPanel/kit';
import { api } from '../lib/api';
import { MaintenanceProvider, useMaintenance } from '../lib/maintenance';
import { PANEL_REFRESH, usePanel } from '../lib/panel';
import { useTheme } from '../lib/ThemeContext';
import type { SharedProps } from '../lib/types';
import { useApi } from '../lib/useApi';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  ability?: string;
  superOnly?: boolean;
  badge?: number;
}

/**
 * The Admin Panel shell: a deep-purple sidebar with gold accents (in both themes), a
 * header with the page title, a Light / Dark toggle (saved in the browser and on the
 * account, so it follows the user after a refresh or a new sign-in), the notification
 * bell and the signed-in user. Agents, Master Agents and Silver Agents get the same shell
 * as their Agent Panel, with the navigation of their role. Reverb `panel.updated` events
 * (and returning to the tab) refresh whatever the open page shows.
 */
export default function AdminPanelLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { auth } = usePage<SharedProps>().props;
  const user = auth.user as (SharedProps['auth']['user'] & { theme?: 'light' | 'dark' | null }) | null;
  const { isDark, toggle } = useTheme() as { isDark: boolean; toggle: () => void };
  const [open, setOpen] = useState(false);
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const panel = usePanel();
  const counts = useApi<{ data: { pending_users: number; banned_users: number } }>(`${panel.api}/overview`);
  const abilities = new Set(user?.abilities ?? []);
  const isSuper = user?.role === 'super_admin';

  // Real-time: refetch on panel.updated (own channel; staff also listen on the staff channel) and on focus.
  useEffect(() => {
    const refresh = () => {
      counts.reload();
      window.dispatchEvent(new Event(PANEL_REFRESH));
    };
    const echo = (window as unknown as { Echo?: { private: (c: string) => { listen: (e: string, cb: () => void) => unknown; stopListening: (e: string, cb: () => void) => unknown } } }).Echo;
    const channels = user ? [`user.${user.id}`, ...(panel.isAgent ? [] : ['staff'])] : [];
    channels.forEach((c) => echo?.private(c).listen('.panel.updated', refresh));
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      channels.forEach((c) => echo?.private(c).stopListening('.panel.updated', refresh));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, panel.isAgent]);

  // Apply the theme saved on the account (e.g. first sign-in on this browser).
  useEffect(() => {
    if (user?.theme && (user.theme === 'dark') !== isDark) toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.theme]);

  const switchTheme = () => {
    const next = isDark ? 'light' : 'dark';
    toggle();
    api.put('/profile/preferences', { theme: next }).catch(() => undefined);
  };

  const allowed = (item: NavItem) => (item.superOnly ? isSuper : !item.ability || isSuper || abilities.has(item.ability));

  const b = panel.base;
  // Loader Accounts: only their three modules, each only with its permission.
  const loaderMain: NavItem[] = [
    { label: 'Overview', href: '/loader', icon: <I.home className="h-5 w-5" /> },
    ...(panel.loaderCan('loader_loads') ? [{ label: 'Load Transactions', href: '/loader/load-logs', icon: <I.logs className="h-5 w-5" /> }] : []),
    ...(panel.loaderCan('loader_commissions')
      ? [
          { label: 'Commission Logs', href: '/loader/commission-logs', icon: <I.coins className="h-5 w-5" /> },
          { label: 'Commission Withdrawal', href: '/loader/commission-withdrawals', icon: <I.wallet className="h-5 w-5" /> },
        ]
      : []),
    ...(panel.loaderCan('loader_passwords') ? [{ label: 'Reset Password', href: '/loader/reset-password', icon: <I.shield className="h-5 w-5" /> }] : []),
  ];
  const main: NavItem[] = panel.isLoader ? loaderMain : [
    { label: 'Overview', href: b, icon: <I.home className="h-5 w-5" /> },
    { label: 'Load Logs', href: `${b}/load-logs`, icon: <I.logs className="h-5 w-5" /> },
    { label: 'Commission Logs', href: `${b}/commission-logs`, icon: <I.coins className="h-5 w-5" /> },
    { label: 'Commission Withdrawal', href: `${b}/commission-withdrawals`, icon: <I.wallet className="h-5 w-5" /> },
    ...(panel.isAgent ? [] : [{ label: 'Maintenance', href: '/admin/maintenance', icon: <I.shield className="h-5 w-5" /> }]),
    ...(panel.isAgent ? [] : [{ label: 'Users / Employees', href: '/admin/employees', icon: <I.user className="h-5 w-5" /> }]),
  ];
  // Agents see only their own downline; Silver Agents recruit no agents, so they have no Agents list.
  const people: NavItem[] = panel.isLoader ? [] : [
    ...(panel.level === 'silver' ? [] : [{ label: panel.isAgent ? 'My Agents' : 'Agents', href: `${b}/accounts/agents`, icon: <I.user className="h-[18px] w-[18px]" /> }]),
    { label: panel.isAgent ? 'My Players' : 'Active Players', href: `${b}/accounts/active-players`, icon: <I.users className="h-[18px] w-[18px]" /> },
    { label: 'Pending Users', href: `${b}/accounts/pending-users`, icon: <I.clock className="h-[18px] w-[18px]" />, badge: counts.data?.data.pending_users },
    ...(panel.isAgent ? [] : [{ label: 'Ban Users', href: '/admin/accounts/ban-users', icon: <I.ban className="h-[18px] w-[18px]" />, badge: counts.data?.data.banned_users }]),
  ];
  // The Platform panel is the Administrators' only: agents have no Platform group (the pages
  // and their API refuse agents on the server too).
  const platform: NavItem[] = panel.isAgent || panel.isLoader ? [] : [
    { label: 'Game Rooms', href: '/admin/rooms', icon: <I.grid className="h-[18px] w-[18px]" />, ability: 'manage_rooms' },
    { label: 'Active Tables', href: '/admin/tables', icon: <I.grid className="h-[18px] w-[18px]" />, ability: 'manage_games' },
    { label: 'Game Sessions', href: '/admin/sessions', icon: <I.logs className="h-[18px] w-[18px]" />, ability: 'manage_games' },
    { label: 'Wallets', href: '/admin/wallets', icon: <I.wallet className="h-[18px] w-[18px]" />, ability: 'review_transactions' },
    { label: 'Ledger', href: '/admin/transactions', icon: <I.coins className="h-[18px] w-[18px]" />, ability: 'review_transactions' },
    { label: 'Reports', href: '/admin/reports', icon: <I.logs className="h-[18px] w-[18px]" />, ability: 'view_reports' },
    { label: 'Audit Logs', href: '/admin/audit-logs', icon: <I.shield className="h-[18px] w-[18px]" />, ability: 'view_audit_logs' },
    { label: 'Administrators', href: '/admin/administrators', icon: <I.shield className="h-[18px] w-[18px]" />, superOnly: true },
    { label: 'System Settings', href: '/admin/settings', icon: <I.grid className="h-[18px] w-[18px]" />, superOnly: true },
  ].filter(allowed);

  const peopleOpenDefault = people.some((p) => path.startsWith(p.href));
  const platformOpenDefault = platform.some((p) => path.startsWith(p.href));
  const [peopleOpen, setPeopleOpen] = useState(true);
  const [platformOpen, setPlatformOpen] = useState(platformOpenDefault);
  useEffect(() => {
    if (peopleOpenDefault) setPeopleOpen(true);
  }, [peopleOpenDefault]);

  const isActive = (href: string) => (href === b ? path === b || path === `${b}/` : path.startsWith(href));

  const item = (n: NavItem, child = false) => (
    <Link
      key={n.href}
      href={n.href}
      onClick={() => setOpen(false)}
      aria-current={isActive(n.href) ? 'page' : undefined}
      className={`group flex items-center gap-3 rounded-xl px-3 font-semibold transition ${child ? 'ml-6 py-2 text-[15px]' : 'py-2.5 text-base'} ${
        isActive(n.href)
          ? 'bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white shadow-[0_6px_20px_rgb(124_58_237/0.55)] ring-1 ring-[#f5c542]/40'
          : 'text-white/80 hover:bg-white/[0.07] hover:text-white'
      }`}
    >
      <span className={isActive(n.href) ? 'text-white' : 'text-white/70 group-hover:text-[#f5c542]'}>{n.icon}</span>
      <span className="flex-1 truncate">{n.label}</span>
      {!!n.badge && <span className="rounded-full bg-gradient-to-b from-[#f43f5e] to-[#be123c] px-2 py-0.5 text-xs font-black text-white">{n.badge}</span>}
    </Link>
  );

  const group = (label: string, icon: ReactNode, isOpen: boolean, setIsOpen: (v: boolean) => void, items: NavItem[]) =>
    items.length > 0 && (
      <div>
        <button type="button" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-base font-semibold text-white/85 transition hover:bg-white/[0.07]">
          <span className="text-white/70">{icon}</span>
          <span className="flex-1 text-left">{label}</span>
          <I.chevron className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && <div className="mt-1 space-y-1">{items.map((n) => item(n, true))}</div>}
      </div>
    );

  return (
    <MaintenanceProvider>
    <div className="min-h-screen bg-[#f4f1fb] font-sans text-[#1c1530] dark:bg-[#0b0814] dark:text-white">
      <Head title={title} />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col overflow-y-auto bg-gradient-to-b from-[#1e0f45] via-[#170b35] to-[#0d0620] text-white shadow-[8px_0_40px_rgb(0_0_0/0.35)] transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label={`${panel.name} navigation`}
      >
        <div className="flex flex-col items-center border-b border-white/10 px-6 pb-5 pt-6">
          <Crown className="h-9 w-12" />
          <p className="bg-gradient-to-b from-[#fff3b0] via-[#f5c542] to-[#b7791f] bg-clip-text text-[34px] font-black italic leading-none tracking-tight text-transparent drop-shadow-[0_2px_0_rgb(0_0_0/0.35)]">PUSOY553</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-bold text-white">
            <I.shield className="h-5 w-5 text-[#f5c542]" /> {panel.name}
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {main.map((n) => item(n))}
          <div className="my-3 border-t border-white/10" />
          {group('Agents / Players', <I.users className="h-5 w-5" />, peopleOpen, setPeopleOpen, people)}
          <div className="my-3 border-t border-white/10" />
          {!panel.isAgent && !panel.isLoader && item({ label: 'Archive', href: '/admin/accounts/archive', icon: <I.archive className="h-5 w-5" /> })}
          {group('Platform', <I.grid className="h-5 w-5" />, platformOpen, setPlatformOpen, platform)}
          <div className="my-3 border-t border-white/10" />
          {!panel.isAgent && !panel.isLoader && item({ label: 'Reset Password', href: '/admin/reset-password', icon: <I.shield className="h-5 w-5" /> })}
          {item({ label: 'Change Password', href: `${b}/change-password`, icon: <I.lock className="h-5 w-5" /> })}
          <button type="button" onClick={() => router.post('/logout')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-base font-semibold text-white/80 transition hover:bg-rose-500/15 hover:text-white">
            <I.power className="h-5 w-5 text-white/70" /> Logout
          </button>
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      {/* Main */}
      <div className="lg:pl-[290px]">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#e7e1f6] bg-white/85 px-4 py-3 backdrop-blur md:px-8 md:py-4 dark:border-white/[0.06] dark:bg-[#0f0b1b]/85">
          <button type="button" onClick={() => setOpen(true)} className="rounded-xl p-2 text-[#3b3354] hover:bg-[#f3eeff] lg:hidden dark:text-white/80 dark:hover:bg-white/10" aria-label="Open menu">
            <I.menu className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-black tracking-tight md:text-3xl">{title}</h1>
            {subtitle && <p className="truncate text-sm text-[#6b6385] dark:text-white/55">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={switchTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
            className="flex h-10 items-center gap-2 rounded-full border border-[#e3dcf5] bg-white px-3 text-sm font-bold text-[#4b4266] transition hover:border-[#c4b5fd] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#f5c542]"
          >
            {isDark ? <I.sun className="h-5 w-5" /> : <I.moon className="h-5 w-5 text-[#6d28d9]" />}
            <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
          <Link href="/notifications" aria-label="Notifications" className="relative rounded-full p-2 text-[#4b4266] hover:bg-[#f3eeff] dark:text-white/80 dark:hover:bg-white/10">
            <I.bell className="h-6 w-6" />
            {!!counts.data?.data.pending_users && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0f0b1b]" />}
          </Link>
          <div className="hidden items-center gap-3 border-l border-[#e7e1f6] pl-3 sm:flex dark:border-white/10">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-[#2a1458] to-[#120a26] ring-2 ring-[#f5c542]">
              <Crown className="h-6 w-7" />
            </span>
            <span className="leading-tight">
              <span className="block text-base font-extrabold">{user?.name ?? ''}</span>
              <span className="block text-xs text-[#6b6385] dark:text-white/55">{(user as { account_type_label?: string } | null)?.account_type_label ?? user?.role_label}</span>
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
          <MaintenanceBanner isAgent={panel.isAgent} isLoader={panel.isLoader} />
          {children}
        </main>
      </div>
    </div>
    </MaintenanceProvider>
  );
}

/** Live notice while a maintenance mode is on (Admins see every mode; agents see what affects them). */
function MaintenanceBanner({ isAgent, isLoader }: { isAgent: boolean; isLoader: boolean }) {
  const m = useMaintenance();
  if (m.mode === 'off' || (isAgent && !m.transactions_blocked)) return null;

  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
      <I.shield className="mt-0.5 h-5 w-5 shrink-0" />
      <p>
        <b>Maintenance: {m.label}.</b>{' '}
        {isAgent
          ? 'Transactions (Load / Withdraw Chips, Chips requests, commission conversion and withdrawals) are temporarily unavailable. You can still view your panel.'
          : m.transactions_blocked
            ? `Agent and player transactions are disabled${m.game_blocked ? ' and the mobile game is closed' : ''}.`
            : 'The mobile game is closed; all transactions keep working.'}
        {!isAgent && !isLoader && (
          <>
            {' '}
            <Link href="/admin/maintenance" className="font-bold underline">
              Maintenance settings
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
