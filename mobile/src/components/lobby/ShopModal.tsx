'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { GoldCoins } from '@/components/HomeArt';
import { KeyIcon } from '@/components/game';
import { api, errorText, idempotencyKey } from '@/lib/api';
import { when } from '@/lib/hooks';
import { play } from '@/lib/sound';

/**
 * Shop (Main Lobby pop-up, 80% × 80% of the screen): exchange Keys for Gold at the four fixed
 * packages. The server decides everything (GET /shop, POST /shop/key-exchanges): it checks your
 * Keys, takes them and adds the Gold in one transaction, refuses duplicates (idempotency key) and
 * logs the exchange. Each exchange needs an explicit confirmation that it is final and
 * non-refundable. Sizes use container units of the pop-up, so it scales with any screen.
 */
interface Pack {
  id: string;
  keys: number;
  gold: number;
}
interface Exchange {
  id: number;
  package: string;
  keys: string;
  gold: string;
  created_at: string;
}
interface ShopState {
  packages: Pack[];
  balances: { keys: string; gold: string };
  history: Exchange[];
}

const n = (v: string | number | undefined) => Math.floor(Number(v ?? 0));
const fmt = (v: number) => v.toLocaleString('en-US');
const plural = (k: number) => `${fmt(k)} ${k === 1 ? 'KEY' : 'KEYS'}`;
/** Container-height units: every size follows the pop-up's own height. */
const h = (v: number) => `${v}cqh`;

/** A glossy golden key with a red gem (Shop package art). */
function GoldKey({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 60" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="shop-key-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6c0" />
          <stop offset="0.45" stopColor="#ffc531" />
          <stop offset="1" stopColor="#b86b00" />
        </linearGradient>
        <radialGradient id="shop-key-gem" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffb3b3" />
          <stop offset="0.5" stopColor="#e0262f" />
          <stop offset="1" stopColor="#7a0a10" />
        </radialGradient>
      </defs>
      <g transform="rotate(-45 30 30)" stroke="#7a3e00" strokeWidth="1.4" fill="url(#shop-key-gold)">
        <circle cx="30" cy="14" r="11" />
        <rect x="27" y="23" width="6" height="30" rx="2" />
        <rect x="33" y="40" width="8" height="4" rx="1.2" />
        <rect x="33" y="47" width="6" height="4" rx="1.2" />
      </g>
      <circle cx="21.5" cy="21.5" r="5.2" fill="url(#shop-key-gem)" stroke="#7a3e00" strokeWidth="1" />
      <circle cx="20" cy="20" r="1.6" fill="#fff" opacity="0.8" />
    </svg>
  );
}

function KeyPile({ count }: { count: number }) {
  const shown = Math.min(count, 6);
  return (
    <div className="relative flex items-center justify-center" style={{ height: h(17), width: "100%" }} aria-hidden="true">
      {Array.from({ length: shown }, (_, i) => {
        const mid = (shown - 1) / 2;
        return (
          <span key={i} className="absolute drop-shadow-[0_0.6cqh_0.6cqh_rgb(0_0_0/0.45)]" style={{ transform: `translateX(${(i - mid) * 3.2}cqh) translateY(${Math.abs(i - mid) * 0.8}cqh) rotate(${(i - mid) * 9}deg)` }}>
            <GoldKey className="h-[17cqh] w-[17cqh] drop-shadow-[0_0_1.2cqh_rgb(255_200_60/0.7)]" />
          </span>
        );
      })}
    </div>
  );
}

export default function ShopModal({ onClose, onGetKeys }: { onClose: () => void; onGetKeys: () => void }) {
  const [state, setState] = useState<ShopState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pack | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const requestKey = useRef<string | null>(null);
  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    api<{ data: ShopState }>('/shop')
      .then((r) => {
        setState(r.data);
        setLoadError(null);
      })
      .catch((e) => setLoadError(errorText(e)));
  }, []);
  useEffect(() => {
    load();
    // Keep in step with the lobby wallets (and any other change to your balances).
    window.addEventListener('pusoy:wallet', load);
    return () => window.removeEventListener('pusoy:wallet', load);
  }, [load]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const keys = state ? n(state.balances.keys) : undefined;

  const choose = (p: Pack) => {
    if (busy) return;
    play('tap');
    if (keys !== undefined && keys < p.keys) {
      play('lose');
      setToast({ ok: false, text: `Not enough Keys — this package needs ${plural(p.keys).toLowerCase()} and you have ${fmt(keys)}.` });
      return;
    }
    requestKey.current = idempotencyKey(); // one key per confirmed exchange: a double tap can't repeat it
    setAgreed(false);
    setConfirm(p);
  };

  const exchange = async () => {
    if (!confirm || !agreed || busy) return;
    setBusy(true);
    try {
      const r = await api<{ message: string; data: { balances: ShopState['balances'] } }>('/shop/key-exchanges', {
        method: 'POST',
        body: { package: confirm.id, idempotency_key: requestKey.current, confirmed: true },
      });
      play('win');
      setState((s) => (s ? { ...s, balances: r.data.balances } : s));
      setToast({ ok: true, text: `Success! ${plural(confirm.keys).toLowerCase()} exchanged for ${fmt(confirm.gold)} Gold.` });
      setConfirm(null);
      window.dispatchEvent(new Event('pusoy:wallet'));
    } catch (e) {
      play('lose');
      setToast({ ok: false, text: errorText(e) });
      setConfirm(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  const frame: CSSProperties = { width: '80vw', height: '80vh', containerType: 'size' };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Shop"
        onClick={(e) => e.stopPropagation()}
        style={frame}
        className="sp-pop relative rounded-[3cqh] bg-gradient-to-b from-[#ffe58a] via-[#d99a1c] to-[#7a4a00] p-[0.9cqh] shadow-[0_0_6cqh_rgb(255_190_60/0.45),0_2cqh_4cqh_rgb(0_0_0/0.6)]"
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[2.4cqh] bg-[radial-gradient(120%_90%_at_50%_0%,#4a0d10,#240406_60%,#120203)] text-white">

          {/* header: title plaque, Keys balance, close */}
          <div className="relative flex shrink-0 items-center justify-center" style={{ height: h(15) }}>
            <div className="rounded-full border-[0.6cqh] border-[#ffd34d] bg-gradient-to-b from-[#3a1405] to-[#160602] px-[6cqh] py-[0.6cqh] shadow-[0_0_3cqh_rgb(255_200_80/0.5)]">
              <h2 className="font-display font-black tracking-wide text-[#ffd34d] drop-shadow-[0_0.5cqh_0_#5a2a00]" style={{ fontSize: h(7.5), lineHeight: 1 }}>
                SHOP
              </h2>
            </div>
            <div className="absolute right-[12cqh] top-1/2 flex -translate-y-1/2 items-center gap-[1cqh] rounded-full border-[0.5cqh] border-[#ffd34d] bg-gradient-to-b from-[#3a0b7a] to-[#160330] py-[0.5cqh] pl-[0.8cqh] pr-[0.6cqh]" role="group" aria-label="Your Keys">
              <KeyIcon size={0} className="!h-[6cqh] !w-[6cqh]" />
              <span className="min-w-[14cqh] text-right font-display font-black tabular-nums" style={{ fontSize: h(4.4) }} aria-label="Keys balance">
                {keys !== undefined ? fmt(keys) : '…'}
              </span>
              <button
                type="button"
                aria-label="Get Keys"
                onClick={() => {
                  play('tap');
                  onGetKeys();
                }}
                className="lx-tile flex h-[6cqh] w-[6cqh] items-center justify-center rounded-full border-[0.4cqh] border-[#c8ffd8] bg-gradient-to-b from-[#5ef08a] to-[#13a344] font-display font-black text-white"
                style={{ fontSize: h(4.4), lineHeight: 1 }}
              >
                +
              </button>
            </div>
            <button
              type="button"
              aria-label="Close"
              disabled={busy}
              onClick={() => {
                play('tap');
                onClose();
              }}
              className="lx-tile absolute right-[2cqh] top-1/2 flex h-[8cqh] w-[8cqh] -translate-y-1/2 items-center justify-center rounded-full border-[0.6cqh] border-[#ffd34d] bg-gradient-to-b from-[#ff6b5c] to-[#c0101a] font-black text-white shadow-[0_0.6cqh_0_#6b0606] disabled:opacity-50"
              style={{ fontSize: h(4.2) }}
            >
              ✕
            </button>
          </div>

          <div className="flex min-h-0 flex-1 gap-[2cqh] px-[2cqh] pb-[1.5cqh]">
            {/* left: category tab + your recent exchanges */}
            <aside className="flex w-[22%] shrink-0 flex-col gap-[1.5cqh]">
              <div className="flex items-center gap-[1.2cqh] rounded-[1.6cqh] border-[0.5cqh] border-[#ffd34d] bg-gradient-to-r from-[#ffc531] to-[#c27a04] px-[1.5cqh] py-[1cqh] shadow-[0_0_2.5cqh_rgb(255_200_80/0.6)]" aria-current="page">
                <KeyIcon size={0} className="!h-[6cqh] !w-[6cqh]" />
                <span className="font-display font-black text-[#3a1405]" style={{ fontSize: h(4.6) }}>
                  Keys
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-[1.6cqh] bg-black/35 p-[1.2cqh]">
                <p className="font-display font-black uppercase tracking-wide text-[#ffd34d]" style={{ fontSize: h(2.6) }}>
                  Your exchanges
                </p>
                {state?.history.length === 0 && (
                  <p className="mt-[0.6cqh] text-white/60" style={{ fontSize: h(2.5) }}>
                    None yet.
                  </p>
                )}
                <ul className="mt-[0.6cqh] space-y-[0.6cqh]" aria-label="Exchange history">
                  {state?.history.map((x) => (
                    <li key={x.id} className="rounded-[1cqh] bg-white/5 px-[1cqh] py-[0.5cqh]" style={{ fontSize: h(2.4) }}>
                      <span className="font-black">−{fmt(n(x.keys))} Keys</span> → <span className="font-black text-[#ffe14d]">+{fmt(n(x.gold))} Gold</span>
                      <span className="block text-white/50">{when(x.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            {/* packages + notice */}
            <section className="flex min-w-0 flex-1 flex-col gap-[1.5cqh]">
              {loadError && (
                <p role="alert" className="rounded-full bg-[#3a0d14] px-[2cqh] py-[0.8cqh] text-center font-bold text-[#ffb3bd]" style={{ fontSize: h(2.8) }}>
                  {loadError}{' '}
                  <button type="button" className="underline" onClick={load}>
                    Retry
                  </button>
                </p>
              )}
              <ul className="grid min-h-0 flex-1 grid-cols-4 gap-[1.6cqh]" aria-label="Exchange packages">
                {(state?.packages ?? []).map((p) => {
                  const short = keys !== undefined && keys < p.keys;
                  return (
                    <li key={p.id} className="flex min-h-0 flex-col items-center justify-between rounded-[2cqh] border-[0.5cqh] border-[#e8b340] bg-[radial-gradient(90%_70%_at_50%_35%,#8a1418,#3a0507)] px-[1cqh] py-[1.4cqh] shadow-[inset_0_0_2cqh_rgb(0_0_0/0.6)]" aria-label={`${p.keys} ${p.keys === 1 ? 'Key' : 'Keys'} for ${p.gold} Gold`}>
                      <span className="font-display font-black text-[#ffe9b0] drop-shadow-[0_0.4cqh_0_rgb(0_0_0/0.6)]" style={{ fontSize: h(5) }}>
                        {plural(p.keys)}
                      </span>
                      <KeyPile count={p.keys} />
                      <span className="text-[#ffd34d]" style={{ fontSize: h(3) }} aria-hidden="true">
                        ▼
                      </span>
                      <span className="flex items-center gap-[0.8cqh] font-display font-black" style={{ fontSize: h(5.4), lineHeight: 1 }}>
                        <span className="inline-block [&>svg]:!h-full [&>svg]:!w-full" style={{ width: h(7), height: h(7) }}>
                          <GoldCoins size={36} />
                        </span>
                        = {fmt(p.gold)}
                      </span>
                      <span className="font-display font-black text-[#ffd34d]" style={{ fontSize: h(3) }}>
                        GOLD
                      </span>
                      <button
                        type="button"
                        onClick={() => choose(p)}
                        disabled={busy || !state}
                        aria-label={`Exchange ${p.keys} ${p.keys === 1 ? 'Key' : 'Keys'} for ${p.gold} Gold`}
                        className={`lx-tile mt-[0.8cqh] flex w-full items-center justify-center gap-[0.8cqh] rounded-full border-[0.5cqh] py-[0.9cqh] font-display font-black text-white shadow-[0_0.7cqh_0_rgb(0_0_0/0.45)] disabled:opacity-60 ${short ? 'border-white/30 bg-gradient-to-b from-[#6b6b6b] to-[#3a3a3a]' : 'border-[#ffd34d] bg-gradient-to-b from-[#ff4a4a] to-[#a50d14]'}`}
                        style={{ fontSize: h(3) }}
                      >
                        <KeyIcon size={0} className="!h-[4.4cqh] !w-[4.4cqh]" />
                        <span className="leading-tight">{short ? `NEED ${plural(p.keys)}` : `EXCHANGE ${plural(p.keys)}`}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="shrink-0 rounded-[1.6cqh] border-[0.4cqh] border-[#ffd34d]/70 bg-black/45 px-[2cqh] py-[1cqh]" role="note" aria-label="Important notice">
                <p className="font-display font-black text-[#ffd34d]" style={{ fontSize: h(2.8) }}>
                  IMPORTANT NOTICE
                </p>
                <ul className="grid grid-cols-2 gap-x-[3cqh] text-white/85" style={{ fontSize: h(2.4) }}>
                  <li>• Keys used in an exchange are non-refundable.</li>
                  <li>• Gold received cannot be converted back into Keys.</li>
                  <li>• All completed exchanges are final.</li>
                  <li>• Review and confirm each exchange before it is completed.</li>
                </ul>
              </div>
            </section>
          </div>

          {/* confirmation */}
          {confirm && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
              <div role="alertdialog" aria-modal="true" aria-label="Confirm exchange" className="sp-pop w-[62%] rounded-[2.4cqh] border-[0.6cqh] border-[#ffd34d] bg-gradient-to-b from-[#5a0a10] to-[#1e0204] p-[3cqh] text-center shadow-[0_0_5cqh_rgb(255_200_80/0.5)]">
                <p className="font-display font-black text-[#ffd34d]" style={{ fontSize: h(5) }}>
                  Confirm exchange
                </p>
                <p className="mt-[1cqh] font-display font-black" style={{ fontSize: h(4.2) }}>
                  {plural(confirm.keys)} → {fmt(confirm.gold)} GOLD
                </p>
                <p className="mt-[0.6cqh] text-white/75" style={{ fontSize: h(2.8) }}>
                  Keys after: {fmt((keys ?? 0) - confirm.keys)} · This exchange is final.
                </p>
                <label className="mx-auto mt-[2cqh] flex max-w-[90%] cursor-pointer items-start gap-[1.4cqh] rounded-[1.4cqh] bg-black/35 p-[1.4cqh] text-left" style={{ fontSize: h(2.9) }}>
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-[0.4cqh] h-[3.6cqh] w-[3.6cqh] shrink-0 accent-[#ffc531]" aria-label="I understand this exchange is final and non-refundable" />
                  <span>I understand that the Keys are non-refundable, the Gold cannot be converted back into Keys, and this exchange is final.</span>
                </label>
                <div className="mt-[2.4cqh] flex justify-center gap-[2cqh]">
                  <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="lx-tile rounded-full border-[0.5cqh] border-white/60 bg-black/35 px-[4cqh] py-[1.2cqh] font-display font-black disabled:opacity-50" style={{ fontSize: h(3.4) }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={exchange}
                    disabled={!agreed || busy}
                    className="lx-tile rounded-full border-[0.5cqh] border-[#fff3a0] bg-gradient-to-b from-[#ffe46a] to-[#e08a00] px-[4cqh] py-[1.2cqh] font-display font-black text-[#4a1d00] shadow-[0_0.7cqh_0_#8a4a00] disabled:opacity-50"
                    style={{ fontSize: h(3.4) }}
                  >
                    {busy ? 'Exchanging…' : 'Confirm exchange'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {toast && (
            <div role={toast.ok ? 'status' : 'alert'} className={`absolute left-1/2 top-[15cqh] z-20 max-w-[80%] -translate-x-1/2 rounded-full border-[0.5cqh] px-[3cqh] py-[1cqh] text-center font-display font-black shadow-lg ${toast.ok ? 'border-[#4ee36b] bg-[#0f2a1c] text-[#b9ffcb]' : 'border-[#ff8a8a] bg-[#3a0d14] text-[#ffe4e4]'}`} style={{ fontSize: h(3) }}>
              {toast.text}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
