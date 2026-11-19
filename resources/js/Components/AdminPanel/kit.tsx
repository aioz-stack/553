import { useEffect, useRef, useState, type ReactNode, type SVGProps } from 'react';
import { api, errorMessage, newIdempotencyKey } from '../../lib/api';

/**
 * Admin Panel UI kit: premium black / deep-purple / metallic-gold look in dark mode,
 * lavender / white / purple in light mode. Every colour has a light and a dark variant
 * so nothing is left in the wrong theme.
 */

export const fmt = (v: string | number | null | undefined, digits = 0) =>
  Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 });

export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

// ------------------------------------------------------------------ icons

type IconProps = SVGProps<SVGSVGElement>;
const base = (d: ReactNode, viewBox = '0 0 24 24') =>
  function Icon(props: IconProps) {
    return (
      <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        {d}
      </svg>
    );
  };

export const I = {
  home: base(<path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />),
  logs: base(<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 12h6M10 16h6" /></>),
  coins: base(<><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" /></>),
  wallet: base(<><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z" /><path d="M4 7l11-3v3M16 13.5h2" /></>),
  users: base(<><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 14c2.4.2 4 1.8 4.5 4.6" /></>),
  user: base(<><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /></>),
  userPlus: base(<><circle cx="10" cy="8" r="3.4" /><path d="M3.5 20c.7-3.6 3.3-5.7 6.5-5.7 1.7 0 3.2.6 4.3 1.6M18 14v6M15 17h6" /></>),
  clock: base(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  ban: base(<><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>),
  archive: base(<><rect x="3" y="4" width="18" height="5" rx="1.2" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>),
  lock: base(<><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 15v2" /></>),
  power: base(<><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></>),
  bell: base(<><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>),
  sun: base(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" /></>),
  moon: base(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />),
  menu: base(<path d="M4 7h16M4 12h16M4 17h16" />),
  copy: base(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>),
  check: base(<path d="M5 12.5 10 17 19 7" />),
  eye: base(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>),
  plus: base(<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>),
  minus: base(<><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>),
  percent: base(<><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.3" /><circle cx="17" cy="17" r="2.3" /></>),
  search: base(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>),
  chevron: base(<path d="m6 9 6 6 6-6" />),
  x: base(<path d="M6 6l12 12M18 6 6 18" />),
  shield: base(<path d="M12 3 19.5 6v6c0 4.6-3.2 8-7.5 9-4.3-1-7.5-4.4-7.5-9V6z" />),
  grid: base(<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>),
  restore: base(<><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></>),
  info: base(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.4" /></>),
  link: base(<><path d="M10 14a4.5 4.5 0 0 0 6.4 0l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4L11.5 6" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.3-1.2" /></>),
  trash: base(<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />),
  arrowRight: base(<path d="M5 12h14M13 6l6 6-6 6" />),
};

/** The 553 crown (gold, filled). */
export function Crown({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ap-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.55" stopColor="#ffc531" />
          <stop offset="1" stopColor="#b8770a" />
        </linearGradient>
      </defs>
      <path d="M6 40 2 12l15 12L32 4l15 20 15-12-4 28z" fill="url(#ap-crown)" stroke="#8a5300" strokeWidth="2" strokeLinejoin="round" />
      <rect x="6" y="38" width="52" height="7" rx="2" fill="url(#ap-crown)" stroke="#8a5300" strokeWidth="2" />
      {[17, 32, 47].map((x) => (
        <circle key={x} cx={x} cy="31" r="3" fill="#e0262f" stroke="#8a5300" strokeWidth="1.2" />
      ))}
    </svg>
  );
}

/** A stack of gold coins with a chip mark (the Chips balance art). */
export function ChipStack({ className = 'h-20 w-20' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="ap-coin" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.5" stopColor="#ffd13a" />
          <stop offset="1" stopColor="#d88a00" />
        </radialGradient>
      </defs>
      {[60, 50, 40, 30, 20].map((y) => (
        <g key={y}>
          <ellipse cx="40" cy={y + 6} rx="24" ry="9" fill="#9a5b00" />
          <rect x="16" y={y} width="48" height="6" fill="#d58a00" />
          <ellipse cx="40" cy={y} rx="24" ry="9" fill="url(#ap-coin)" stroke="#a86400" strokeWidth="1.6" />
        </g>
      ))}
      <ellipse cx="33" cy="17" rx="8" ry="2.4" fill="#fff" opacity="0.65" />
    </svg>
  );
}

// ------------------------------------------------------------------ surfaces

export function Panel({ children, className = '', title, icon, actions }: { children: ReactNode; className?: string; title?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-[#e7e1f6] bg-white shadow-[0_6px_24px_rgb(76_29_149/0.07)] dark:border-white/[0.08] dark:bg-[#141022] dark:shadow-[0_8px_30px_rgb(0_0_0/0.45)] ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-3 border-b border-[#efeaf9] px-5 py-4 dark:border-white/[0.06]">
          {icon && <span className="text-[#6d28d9] dark:text-[#f5c542]">{icon}</span>}
          {title && <h2 className="text-lg font-extrabold tracking-tight text-[#1c1530] dark:text-white">{title}</h2>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

const TILE: Record<string, string> = {
  purple: 'from-[#4c1d95] via-[#6d28d9] to-[#9333ea] shadow-[0_14px_34px_rgb(109_40_217/0.38)]',
  blue: 'from-[#0b2a7a] via-[#1d4ed8] to-[#2563eb] shadow-[0_14px_34px_rgb(29_78_216/0.36)]',
  green: 'from-[#065f46] via-[#047857] to-[#10b981] shadow-[0_14px_34px_rgb(4_120_87/0.36)]',
  gold: 'from-[#7c4a03] via-[#b7791f] to-[#eab308] shadow-[0_14px_34px_rgb(183_121_31/0.36)]',
  red: 'from-[#7f1d1d] via-[#b91c1c] to-[#ef4444] shadow-[0_14px_34px_rgb(185_28_28/0.32)]',
};

/** Gradient statistic tile (the dashboard cards). */
export function StatTile({ tone, icon, title, subtitle, value, footer, label }: { tone: keyof typeof TILE | string; icon: ReactNode; title: string; subtitle?: ReactNode; value: ReactNode; footer?: ReactNode; label?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white ring-1 ring-white/15 ${TILE[tone] ?? TILE.purple}`} role="group" aria-label={label ?? title}>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#f5c542]/70 to-transparent" />
      <div className="relative flex items-center gap-4">
        <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-2 border-white/35 bg-white/10 shadow-[inset_0_0_18px_rgb(255_255_255/0.18)]">{icon}</span>
        <div className="min-w-0">
          <p className="text-base font-extrabold leading-tight text-[#fde68a] drop-shadow">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs font-medium text-white/75">{subtitle}</p>}
          <p className="mt-1 truncate text-3xl font-black tracking-tight drop-shadow-[0_2px_0_rgb(0_0_0/0.25)] sm:text-4xl">{value}</p>
        </div>
      </div>
      {footer && <div className="relative mt-3 text-xs font-semibold text-white/85">{footer}</div>}
    </div>
  );
}

/** Small summary figure (inside panels). */
export function Figure({ label, value, tone = 'default', hint }: { label: string; value: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' | 'gold'; hint?: ReactNode }) {
  const color = { default: 'text-[#1c1530] dark:text-white', good: 'text-emerald-600 dark:text-emerald-400', warn: 'text-amber-600 dark:text-amber-400', bad: 'text-rose-600 dark:text-rose-400', gold: 'text-[#a16207] dark:text-[#f5c542]' }[tone];
  return (
    <div className="rounded-xl border border-[#ece7f8] bg-[#faf8ff] p-4 dark:border-white/[0.07] dark:bg-white/[0.03]">
      <p className="text-xs font-bold uppercase tracking-wide text-[#6b6385] dark:text-white/55">{label}</p>
      <p className={`mt-1 text-2xl font-black ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[#857d9c] dark:text-white/45">{hint}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ pills

const STATUS: Record<string, [string, string]> = {
  completed: ['Completed', 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'],
  approved: ['Approved', 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'],
  paid: ['Paid', 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'],
  active: ['Active', 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'],
  pending: ['Pending', 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30'],
  rejected: ['Rejected', 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30'],
  reversed: ['Reversed', 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30'],
  banned: ['Banned', 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30'],
  suspended: ['Suspended', 'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30'],
  archived: ['Archived', 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-white/60 dark:ring-white/15'],
};

export function StatusPill({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, STATUS.archived[1]];
  return <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${cls}`}>{label}</span>;
}

const TYPE: Record<string, string> = {
  agent: 'bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30',
  master: 'bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30',
  silver: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/30',
  player: 'bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30',
  admin: 'bg-zinc-200 text-zinc-800 ring-zinc-300 dark:bg-white/10 dark:text-white/80 dark:ring-white/15',
};
const TYPE_LABEL: Record<string, string> = { agent: 'Agent', master: 'Master Agent', silver: 'Silver Agent', player: 'Player', admin: 'Administrator' };

export function TypePill({ type, label }: { type: string | null | undefined; label?: string | null }) {
  const t = type ?? 'admin';
  return <span className={`inline-flex items-center whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${TYPE[t] ?? TYPE.admin}`}>{label ?? TYPE_LABEL[t] ?? t}</span>;
}

// ------------------------------------------------------------------ table, toolbar, pager

export interface Column<T> {
  key: string;
  label: ReactNode;
  className?: string;
  render: (row: T, index: number) => ReactNode;
}

export function Table<T>({ columns, rows, empty = 'Nothing here yet.', loading, label, rowKey }: { columns: Column<T>[]; rows: T[] | null | undefined; empty?: ReactNode; loading?: boolean; label: string; rowKey: (row: T) => string | number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm" aria-label={label}>
        <thead>
          <tr className="bg-[#f6f3fd] text-xs font-extrabold uppercase tracking-wide text-[#5b5274] dark:bg-white/[0.04] dark:text-white/60">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap px-4 py-3 ${c.className ?? ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0ecf9] dark:divide-white/[0.05]">
          {(rows ?? []).map((row, i) => (
            <tr key={rowKey(row)} className="text-[#2a2240] transition hover:bg-[#faf7ff] dark:text-white/85 dark:hover:bg-white/[0.03]">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>
                  {c.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <p className="p-6 text-center text-sm text-[#857d9c] dark:text-white/50">Loading…</p>}
      {!loading && (rows ?? []).length === 0 && <p className="p-8 text-center text-sm text-[#857d9c] dark:text-white/50">{empty}</p>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="relative block w-full sm:w-72">
      <span className="sr-only">Search</span>
      <I.search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b82a6] dark:text-white/45" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-[#e3dcf5] bg-white pl-9 pr-3 text-sm text-[#1c1530] outline-none ring-[#7c3aed]/30 placeholder:text-[#9a92b2] focus:ring-4 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/35"
      />
    </label>
  );
}

export function Picker<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<[T, string]>; label: string }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-10 rounded-xl border border-[#e3dcf5] bg-white px-3 text-sm font-semibold text-[#2a2240] outline-none ring-[#7c3aed]/30 focus:ring-4 dark:border-white/10 dark:bg-[#1b1530] dark:text-white"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Segmented tabs (status filters, recent-transaction tabs). */
export function Segments<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<[T, ReactNode]>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            value === v
              ? 'bg-gradient-to-b from-[#8b5cf6] to-[#6d28d9] text-white shadow-[0_6px_16px_rgb(109_40_217/0.35)]'
              : 'border border-[#e3dcf5] bg-white text-[#3b3354] hover:border-[#c4b5fd] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-[#8b5cf6]/60'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Pager({ meta, onPage }: { meta?: { current_page: number; last_page: number; total: number } | null; onPage: (p: number) => void }) {
  if (!meta || meta.last_page <= 1) {
    return meta ? <p className="px-5 py-3 text-xs text-[#857d9c] dark:text-white/45">{meta.total} record{meta.total === 1 ? '' : 's'}</p> : null;
  }
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
      <span className="text-xs text-[#857d9c] dark:text-white/45">
        Page {meta.current_page} of {meta.last_page} · {meta.total} records
      </span>
      <div className="flex gap-2">
        <Btn variant="ghost" size="sm" disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}>
          ‹ Prev
        </Btn>
        <Btn variant="ghost" size="sm" disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)}>
          Next ›
        </Btn>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ buttons

type BtnVariant = 'primary' | 'gold' | 'ghost' | 'danger' | 'success';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-gradient-to-b from-[#8b5cf6] to-[#6d28d9] text-white shadow-[0_6px_16px_rgb(109_40_217/0.35)] hover:brightness-110',
  gold: 'bg-gradient-to-b from-[#fde68a] via-[#f5c542] to-[#ca8a04] text-[#3b2400] shadow-[0_6px_16px_rgb(202_138_4/0.35)] hover:brightness-105',
  ghost: 'border border-[#e3dcf5] bg-white text-[#3b3354] hover:border-[#c4b5fd] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/85 dark:hover:border-[#8b5cf6]/60',
  danger: 'bg-gradient-to-b from-[#f43f5e] to-[#be123c] text-white shadow-[0_6px_16px_rgb(190_18_60/0.3)] hover:brightness-110',
  success: 'bg-gradient-to-b from-[#34d399] to-[#059669] text-white shadow-[0_6px_16px_rgb(5_150_105/0.3)] hover:brightness-110',
};

export function Btn({ variant = 'primary', size = 'md', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm'} ${BTN[variant]} ${className}`}
    />
  );
}

/** Round action icon beside a row (Load, Withdraw, Withdraw Commission, View…). */
export function ActionIcon({ label, onClick, tone = 'default', children }: { label: string; onClick: () => void; tone?: 'default' | 'green' | 'red' | 'gold' | 'purple'; children: ReactNode }) {
  const cls = {
    default: 'border-[#e3dcf5] text-[#4b4266] hover:bg-[#f3eeff] dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10',
    green: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10',
    red: 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10',
    gold: 'border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-400/30 dark:text-amber-300 dark:hover:bg-amber-400/10',
    purple: 'border-violet-200 text-violet-600 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10',
  }[tone];
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white transition dark:bg-white/[0.03] ${cls}`}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ feedback

export function Toast({ toast, onDone }: { toast: { ok: boolean; text: string } | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  if (!toast) return null;
  return (
    <div role="status" className={`fixed bottom-6 right-6 z-[100000] max-w-sm rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-2xl ring-1 ring-white/20 ${toast.ok ? 'bg-gradient-to-r from-emerald-600 to-emerald-500' : 'bg-gradient-to-r from-rose-600 to-rose-500'}`}>
      {toast.text}
    </div>
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${tone === 'info' ? 'bg-[#efe9fe] text-[#3b2a66] dark:bg-[#7c3aed]/15 dark:text-[#e9dcff]' : 'bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100'}`}>
      <I.info className="mt-0.5 h-5 w-5 shrink-0 text-[#7c3aed] dark:text-[#c4b5fd]" />
      <div>{children}</div>
    </div>
  );
}

/** A permanent referral link with a copy button right beside it. */
export function CopyLink({ title, url, icon, hint }: { title: string; url: string | null; icon: ReactNode; hint?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement('textarea');
      area.value = url;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Panel className="p-5">
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ede4ff] to-[#d8c7ff] text-[#6d28d9] dark:from-[#7c3aed]/30 dark:to-[#4c1d95]/30 dark:text-[#f5c542]">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-[#1c1530] dark:text-white">{title}</h3>
          {hint && <p className="text-xs text-[#857d9c] dark:text-white/50">{hint}</p>}
          {url ? (
            <div className="mt-2 flex items-center gap-2">
              <input readOnly value={url} aria-label={title} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-xl border border-[#e3dcf5] bg-[#faf8ff] px-3 font-mono text-sm text-[#2a2240] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/90" />
              <button type="button" onClick={copy} aria-label={`Copy ${title}`} title="Copy" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#8b5cf6] to-[#6d28d9] text-white shadow-[0_6px_16px_rgb(109_40_217/0.35)] transition hover:brightness-110">
                {copied ? <I.check className="h-5 w-5" /> : <I.copy className="h-5 w-5" />}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[#857d9c] dark:text-white/50">Not available for this account.</p>
          )}
          {copied && <p role="status" className="mt-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">Copied!</p>}
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ dialogs

export function Dialog({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#0b0614]/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[#e7e1f6] bg-white p-6 shadow-2xl dark:border-[#f5c542]/20 dark:bg-[#151024] ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-center gap-3">
          <h3 className="text-lg font-extrabold text-[#1c1530] dark:text-white">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-lg p-1 text-[#857d9c] hover:bg-[#f3eeff] dark:text-white/50 dark:hover:bg-white/10">
            <I.x className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const fieldClass =
  'h-11 w-full rounded-xl border border-[#e3dcf5] bg-white px-3 text-sm text-[#1c1530] outline-none ring-[#7c3aed]/30 focus:ring-4 dark:border-white/10 dark:bg-white/[0.04] dark:text-white';

export interface AmountAction {
  title: string;
  verb: string;
  /** e.g. "to agent_john" / "from agent_john" */
  target: string;
  path: string;
  limitLabel?: string;
  limit?: string | null;
  variant?: BtnVariant;
}

/**
 * Amount → confirm → submit. One idempotency key per dialog, so a double click or a
 * retried request can never move Chips twice. The server validates everything.
 */
export function AmountDialog({ action, onClose, onDone }: { action: AmountAction | null; onClose: () => void; onDone: (message: string) => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    if (action) {
      setAmount('');
      setNote('');
      setStep('form');
      setError(null);
      key.current = newIdempotencyKey();
    }
  }, [action]);

  const valid = /^\d{1,13}(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;

  const submit = async () => {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ message: string }>(action.path, { amount, note: note || undefined, idempotency_key: key.current });
      onDone(r.data.message);
    } catch (e) {
      setError(errorMessage(e));
      setStep('form');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!action} title={action?.title ?? ''} onClose={onClose}>
      {action && step === 'form' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setStep('confirm');
          }}
          className="space-y-4"
        >
          {action.limit != null && (
            <p className="text-sm text-[#5b5274] dark:text-white/65">
              {action.limitLabel ?? 'Available'}: <b className="text-[#1c1530] dark:text-white">{fmt(action.limit, 2)} Chips</b>
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-[#3b3354] dark:text-white/80">Amount (Chips)</span>
            <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className={fieldClass} placeholder="0" aria-label="Amount (Chips)" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-[#3b3354] dark:text-white/80">Note (optional)</span>
            <input value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} className={fieldClass} aria-label="Note" />
          </label>
          {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>
            <Btn type="submit" variant={action.variant ?? 'primary'} disabled={!valid}>
              Continue
            </Btn>
          </div>
        </form>
      )}
      {action && step === 'confirm' && (
        <div className="space-y-5">
          <p className="text-base text-[#2a2240] dark:text-white/90">
            {action.verb} <b className="text-[#6d28d9] dark:text-[#f5c542]">{fmt(amount, 2)} Chips</b> {action.target}?
          </p>
          {note && <p className="text-sm text-[#5b5274] dark:text-white/60">Note: {note}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setStep('form')} disabled={busy}>
              Back
            </Btn>
            <Btn variant={action.variant ?? 'primary'} onClick={submit} disabled={busy}>
              {busy ? 'Processing…' : `Confirm ${action.verb}`}
            </Btn>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export interface ConfirmAction {
  title: string;
  message: ReactNode;
  confirm: string;
  variant?: BtnVariant;
  /** Ask for a reason (required when `reasonRequired`). */
  reason?: 'optional' | 'required';
  run: (reason: string) => Promise<string>;
}

export function ConfirmDialog({ action, onClose, onDone }: { action: ConfirmAction | null; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setReason('');
    setError(null);
  }, [action]);
  const go = async () => {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await action.run(reason));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!action} title={action?.title ?? ''} onClose={onClose}>
      {action && (
        <div className="space-y-4">
          <div className="text-sm text-[#2a2240] dark:text-white/85">{action.message}</div>
          {action.reason && (
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-[#3b3354] dark:text-white/80">Reason{action.reason === 'required' ? '' : ' (optional)'}</span>
              <textarea value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} rows={3} aria-label="Reason" className={`${fieldClass} h-auto py-2`} />
            </label>
          )}
          {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Btn>
            <Btn variant={action.variant ?? 'primary'} onClick={go} disabled={busy || (action.reason === 'required' && reason.trim() === '')}>
              {busy ? 'Working…' : action.confirm}
            </Btn>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Label / value rows in a details dialog. */
export function Details({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-wide text-[#857d9c] dark:text-white/45">{k}</dt>
          <dd className="mt-0.5 break-words text-sm font-semibold text-[#1c1530] dark:text-white/90">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "@username" with the account id under it. */
export function Who({ who }: { who: { username: string; id?: number } | null | undefined }) {
  if (!who) return <span className="text-[#9a92b2] dark:text-white/40">—</span>;
  return <span className="font-semibold">{who.username}</span>;
}
