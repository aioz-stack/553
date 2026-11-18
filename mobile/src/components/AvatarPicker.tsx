'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AVATAR_CATEGORY_LABEL, AVATAR_IDS, avatarCategory, avatarFor, avatarName, avatarUrl, type AvatarCategory } from '@/lib/avatars';
import { play } from '@/lib/sound';

/**
 * Avatar gallery: the 553 cartoon collection (Boys, Girls, Animals). Filter by category, tap to
 * preview, Confirm saves it to your account (PUT /profile/avatar) — it then shows everywhere
 * (home, lobby, Choose Your Seat, friends, profile, game table), and anyone at your table sees it
 * change. Rendered in a portal so it works from any screen (landscape stage or portrait).
 */
type Tab = 'all' | AvatarCategory;
const TABS: Array<[Tab, string]> = [
  ['all', 'All'],
  ['boy', AVATAR_CATEGORY_LABEL.boy],
  ['girl', AVATAR_CATEGORY_LABEL.girl],
  ['animal', AVATAR_CATEGORY_LABEL.animal],
];

export default function AvatarPicker({ onClose, onSaved }: { onClose: () => void; onSaved?: (id: string) => void }) {
  const { user, refresh } = useAuth();
  const current = avatarFor(user?.avatar, user?.id);
  const [tab, setTab] = useState<Tab>('all');
  const [sel, setSel] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ids = tab === 'all' ? AVATAR_IDS : AVATAR_IDS.filter((id) => avatarCategory(id) === tab);
  const changed = sel !== current;

  const confirm = async () => {
    if (busy) return;
    if (!changed) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/profile/avatar', { method: 'PUT', body: { avatar: sel } });
      await refresh();
      play('win');
      onSaved?.(sel);
      onClose();
    } catch (e) {
      setError(errorText(e));
      play('lose');
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose your avatar"
        onClick={(e) => e.stopPropagation()}
        className="sp-pop lx-gold flex max-h-[94vh] w-full max-w-[980px] flex-col rounded-[28px] p-[6px] shadow-[0_10px_0_#5a2a00,0_18px_40px_rgb(0_0_0/0.5)]"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[23px] bg-gradient-to-b from-[#7a0f16] via-[#55070c] to-[#2e0306] text-white">
          {/* header */}
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h2 className="font-display text-[clamp(22px,3.4vw,34px)] font-black text-[#ffd34d] drop-shadow-[0_2px_0_#3a1300]">Choose Your Avatar</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="lx-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 border-[#ffd34d] bg-gradient-to-b from-[#ff6b5c] to-[#c0101a] text-xl font-black text-white shadow-[0_4px_0_#6b0606]"
            >
              ✕
            </button>
          </div>

          {/* category filters */}
          <div role="tablist" aria-label="Avatar categories" className="flex flex-wrap gap-2 px-5">
            {TABS.map(([t, label]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  play('tap');
                  setTab(t);
                }}
                className={`lx-tile rounded-full border-[3px] px-5 py-1.5 font-display text-[clamp(15px,2vw,20px)] font-black transition ${tab === t ? 'border-[#fff3a0] bg-gradient-to-b from-[#ffe46a] to-[#e08a00] text-[#4a1d00] shadow-[0_4px_0_#8a4a00]' : 'border-[#d9a441] bg-gradient-to-b from-[#6a1218] to-[#33060a] text-[#ffe9b0]'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:flex-row">
            {/* preview */}
            <div className="flex shrink-0 flex-row items-center gap-4 sm:w-[230px] sm:flex-col sm:justify-center">
              <div key={sel} className="cs-pop overflow-hidden rounded-[28px] border-[5px] border-[#ffe14d] bg-white shadow-[0_0_30px_rgb(255_211_77/0.6)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- static export (Capacitor) */}
                <img src={avatarUrl(sel)} alt={`Preview: ${avatarName(sel)}`} width={200} height={200} className="h-[clamp(110px,22vw,200px)] w-[clamp(110px,22vw,200px)] object-cover" />
              </div>
              <div className="text-center">
                <p className="font-display text-[clamp(18px,2.4vw,24px)] font-black text-white" aria-live="polite">
                  {avatarName(sel)}
                </p>
                <p className="text-[14px] font-bold text-white/60">{sel === current ? 'Your current avatar' : AVATAR_CATEGORY_LABEL[avatarCategory(sel)]}</p>
              </div>
            </div>

            {/* gallery */}
            <ul aria-label="Avatars" className="grid min-h-0 flex-1 grid-cols-4 content-start gap-3 overflow-y-auto pr-1 sm:grid-cols-5">
              {ids.map((id) => {
                const on = id === sel;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      aria-label={avatarName(id)}
                      aria-pressed={on}
                      onClick={() => {
                        play('tap');
                        setSel(id);
                      }}
                      className={`relative block w-full overflow-hidden rounded-[20px] border-[4px] bg-white transition duration-200 ${on ? 'cs-selected scale-[1.04] border-[#ffe14d]' : 'border-[#d9a441]/70 hover:scale-[1.04] hover:border-[#ffd34d]'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- static export (Capacitor) */}
                      <img src={avatarUrl(id)} alt="" width={128} height={128} loading="lazy" decoding="async" draggable={false} className="aspect-square w-full object-cover" />
                      {id === current && <span className="absolute left-1 top-1 rounded-full bg-[#13a344] px-2 text-[11px] font-black text-white">Current</span>}
                      {on && (
                        <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#13a344] text-[15px] font-black text-white" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {error && (
            <p role="alert" className="mx-5 mb-2 rounded-full bg-[#3a0d14] px-4 py-1.5 text-center text-[15px] font-bold text-[#ffb3bd]">
              {error}
            </p>
          )}
          <div className="flex justify-center gap-4 px-5 pb-5">
            <button type="button" onClick={onClose} className="lx-tile h-14 min-w-[150px] rounded-full border-4 border-[#d9a441] bg-gradient-to-b from-[#6a1218] to-[#33060a] px-6 font-display text-[20px] font-black text-[#ffe9b0] shadow-[0_5px_0_#1a0204]">
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="lx-tile h-14 min-w-[200px] rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffe46a] via-[#ffc531] to-[#e08a00] px-6 font-display text-[22px] font-black text-[#4a1d00] shadow-[0_5px_0_#8a4a00] disabled:opacity-60"
            >
              {busy ? 'Saving…' : changed ? '✓ Confirm' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
