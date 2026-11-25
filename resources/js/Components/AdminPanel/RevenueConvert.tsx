import { useRef, useState, type SVGProps } from 'react';
import { api, errorMessage, newIdempotencyKey } from '../../lib/api';
import { Btn, Dialog, I, fmt } from './kit';

export interface RevenueConversionRow {
  id: number;
  reference: string;
  role: string;
  revenue_converted: string;
  rate: string;
  chips_credited: string;
  revenue_before: string;
  revenue_after: string;
  chips_before: string;
  chips_after: string;
  status: string;
  created_at: string;
}

export interface RevenueSummary {
  total_revenue: string;
  available_revenue: string;
  my_chips: string;
  chips_to_receive: string;
  min_amount: string;
  rate: string;
  rate_bps: number;
  converted_total: string;
  can_convert: boolean;
  recent: RevenueConversionRow[];
}

/** "12.5" → 1250 (cents), or null when not a positive number with at most 2 decimals. */
export function toCents(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(v)) return null;
  const [whole, frac = ''] = v.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function chipsFor(cents: number, rateBps: number): number {
  return Math.floor((cents * rateBps) / 10000);
}

/** The modal's checks (the server re-checks): numeric, at least the minimum, at most the Available Revenue. */
export function validateAmount(amount: string, s: RevenueSummary | undefined): { ok: true; value: string; cents: number } | { ok: false; error: string; cents: 0 } {
  if (!s) return { ok: false, error: 'Loading…', cents: 0 };
  if (amount.trim() === '') return { ok: false, error: 'Enter an amount to convert.', cents: 0 };
  const cents = toCents(amount);
  if (cents === null) return { ok: false, error: 'Enter a valid number (up to 2 decimals).', cents: 0 };
  const min = toCents(s.min_amount) ?? 2000;
  const max = toCents(s.available_revenue) ?? 0;
  if (cents < min) return { ok: false, error: `The minimum conversion is ${fmt(s.min_amount, 2)}.`, cents: 0 };
  if (cents > max) return { ok: false, error: `You only have ${fmt(s.available_revenue, 2)} Available Revenue.`, cents: 0 };
  return { ok: true, value: amount.trim(), cents };
}

/** Coins turning into a chip: the Self Convert Revenue to Chips icon. */
function ConvertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <ellipse cx="14" cy="30" rx="9" ry="3.5" fill="#f5c542" stroke="#b7791f" strokeWidth="1.6" />
      <path d="M5 30v5c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5v-5" fill="#f5c542" stroke="#b7791f" strokeWidth="1.6" />
      <ellipse cx="14" cy="23" rx="9" ry="3.5" fill="#fbd96b" stroke="#b7791f" strokeWidth="1.6" />
      <path d="M5 23v4c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5v-4" fill="#fbd96b" stroke="#b7791f" strokeWidth="1.6" />
      <path d="M21 12h12l-3.5-3.5M33 12l-3.5 3.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="35" cy="31" r="9.5" fill="#8b5cf6" stroke="#4c1d95" strokeWidth="1.6" />
      <circle cx="35" cy="31" r="5.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeDasharray="2.6 2.2" />
      <circle cx="35" cy="31" r="2" fill="#fff" />
    </svg>
  );
}

/**
 * Self Convert Revenue to Chips (Admin, Incorporator and Master Agent Overview): a centered icon and
 * label open a modal with the Available Revenue and an Amount to Convert (minimum 20, at most the
 * Available Revenue). Confirm stays disabled until the amount is valid. The server re-checks the
 * amount and decides the Chips; a request id makes a double click harmless.
 */
export default function RevenueConvert({ summary, error, locked, lockedHint, onDone }: { summary: RevenueSummary | undefined; error: boolean; locked: boolean; lockedHint?: string; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const requestId = useRef(newIdempotencyKey());

  const show = () => {
    setFail(null);
    setAmount('');
    requestId.current = newIdempotencyKey();
    setOpen(true);
  };

  // Client-side checks mirror the server's (the server re-checks against the locked balance).
  const check = validateAmount(amount, summary);

  const confirm = async () => {
    if (busy || !check.ok || locked) return;
    setBusy(true);
    setFail(null);
    try {
      const r = await api.post<{ message: string }>('/revenue/convert', { amount: check.value, request_id: requestId.current });
      setOpen(false);
      onDone(r.data.message);
    } catch (e) {
      setFail(errorMessage(e));
      // A refused request can be retried as a new one (the old id is spent only on success).
      requestId.current = newIdempotencyKey();
    } finally {
      setBusy(false);
    }
  };
  const status = !summary
    ? error
      ? 'Could not load your Revenue'
      : 'Loading…'
    : summary.can_convert
      ? `${fmt(summary.available_revenue, 2)} Revenue available`
      : `Minimum ${fmt(summary.min_amount, 2)} Revenue to convert`;

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        title={status}
        className="inline-flex w-fit max-w-full items-center gap-2 rounded-2xl bg-gradient-to-br from-[#ede4ff] to-[#d8c7ff] px-3 py-1.5 text-left text-lg font-extrabold leading-tight sm:text-xl text-[#6d28d9] shadow-[0_4px_12px_rgb(109_40_217/0.18)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] dark:from-[#7c3aed]/30 dark:to-[#4c1d95]/30 dark:text-[#f5c542]"
      >
        <ConvertIcon className="h-10 w-10 shrink-0 sm:h-12 sm:w-12" />
        <span>Self Convert Revenue to Chips</span>
      </button>

      <Dialog open={open} title="Self Convert Revenue to Chips" onClose={() => !busy && setOpen(false)}>
        {summary ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {/* Available Revenue */}
            <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#047857] p-4 text-white shadow-[0_8px_20px_rgb(4_120_87/0.25)]">
              <ConvertIcon className="h-12 w-12 shrink-0 text-white" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-white/80">Available Revenue</p>
                <p className="text-3xl font-black leading-tight">{fmt(summary.available_revenue, 2)}</p>
                <p className="text-xs text-white/75">
                  My Total Chips: {fmt(summary.my_chips, 2)} · {summary.rate}
                </p>
              </div>
            </div>

            {/* Amount to Convert */}
            <div>
              <div className="flex items-end justify-between gap-2">
                <label htmlFor="revenue-amount" className="text-sm font-extrabold text-[#1c1530] dark:text-white">
                  Amount to Convert
                </label>
                <button
                  type="button"
                  onClick={() => setAmount(summary.available_revenue)}
                  disabled={busy || !summary.can_convert}
                  className="text-xs font-bold text-[#6d28d9] hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#c4b5fd]"
                >
                  Use all
                </button>
              </div>
              <div className={`mt-1.5 flex items-center rounded-xl border bg-[#faf8ff] focus-within:ring-2 dark:bg-white/[0.04] ${amount !== '' && !check.ok ? 'border-rose-400 focus-within:ring-rose-300' : 'border-[#e3dcf5] focus-within:ring-[#8b5cf6] dark:border-white/10'}`}>
                <input
                  id="revenue-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  autoFocus
                  placeholder={`Minimum ${fmt(summary.min_amount, 2)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  disabled={busy}
                  aria-invalid={amount !== '' && !check.ok}
                  aria-describedby="revenue-amount-help"
                  className="h-12 min-w-0 flex-1 bg-transparent px-4 text-lg font-bold text-[#1c1530] outline-none placeholder:text-sm placeholder:font-semibold placeholder:text-[#a59cc0] dark:text-white"
                />
                <span className="pr-4 text-sm font-bold text-[#857d9c] dark:text-white/50">Revenue</span>
              </div>
              <p id="revenue-amount-help" className={`mt-1.5 text-xs font-semibold ${amount !== '' && !check.ok ? 'text-rose-600 dark:text-rose-400' : 'text-[#857d9c] dark:text-white/50'}`}>
                {amount !== '' && !check.ok
                  ? check.error
                  : check.ok
                    ? `You will receive ${fmt(chipsFor(check.cents, summary.rate_bps) / 100, 2)} Chips`
                    : `Minimum ${fmt(summary.min_amount, 2)} · Maximum ${fmt(summary.available_revenue, 2)}`}
              </p>
            </div>

            {!summary.can_convert && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">You need at least {fmt(summary.min_amount, 2)} Available Revenue to convert.</p>}
            {locked && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{lockedHint ?? 'Transactions are unavailable right now.'}</p>}
            {fail && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">{fail}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Btn variant="ghost" onClick={() => setOpen(false)} disabled={busy} className="inline-flex items-center justify-center gap-2">
                <I.x className="h-4 w-4" /> Cancel
              </Btn>
              <Btn type="submit" variant="primary" disabled={!check.ok || locked || busy} aria-busy={busy} className="inline-flex items-center justify-center gap-2">
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> Converting…
                  </>
                ) : (
                  <>
                    <I.check className="h-4 w-4" /> Confirm Conversion
                  </>
                )}
              </Btn>
            </div>
          </form>
        ) : (
          <p className="text-sm text-[#857d9c] dark:text-white/50">{error ? 'Could not load your Revenue. Please try again.' : 'Loading…'}</p>
        )}
      </Dialog>
    </div>
  );
}
