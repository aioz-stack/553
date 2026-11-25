'use client';

import type { ReactNode } from 'react';
import { ChipIcon } from '@/components/game';
import { play } from '@/lib/sound';

/**
 * Shared 553 Lobby pieces (1600×900 stage coordinates): glossy candy buttons, the crimson-and-gold
 * popup shell, field rows and styled dropdowns — so the Lobby, Create Lobby, password prompt and
 * Waiting Room all share one look.
 */

/** The Chips mark shown next to every Multiplayer amount. */
export function ChipMark({ size = 30 }: { size?: number }) {
  return <ChipIcon size={size} className="inline-block shrink-0 drop-shadow-[0_2px_2px_rgb(0_0_0/0.4)]" />;
}

type Tone = 'gold' | 'purple' | 'red' | 'green' | 'dark' | 'blue';
const TONES: Record<Tone, string> = {
  gold: 'border-[#fff3a0] bg-gradient-to-b from-[#ffe46a] via-[#ffc531] to-[#e08a00] text-[#4a1d00] shadow-[0_7px_0_#8a4a00]',
  purple: 'border-[#ffd34d] bg-gradient-to-b from-[#c47cff] via-[#8f2ff0] to-[#5a12b0] text-white shadow-[0_7px_0_#36086e]',
  red: 'border-[#ffc2c2] bg-gradient-to-b from-[#ff6b5c] to-[#b3121a] text-white shadow-[0_7px_0_#6b0606]',
  green: 'border-[#c8ffd8] bg-gradient-to-b from-[#5ef08a] to-[#13a344] text-white shadow-[0_7px_0_#0b6b2a]',
  blue: 'border-[#9ad4ff] bg-gradient-to-b from-[#3a8aff] to-[#0d3fb0] text-white shadow-[0_7px_0_#082a78]',
  dark: 'border-[#d9a441] bg-gradient-to-b from-[#6a1218] to-[#33060a] text-[#ffe9b0] shadow-[0_6px_0_#1a0204]',
};

export function CandyButton({
  tone = 'gold',
  children,
  onClick,
  disabled,
  className = '',
  type = 'button',
  label,
}: {
  tone?: Tone;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  label?: string;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        play('tap');
        onClick?.();
      }}
      // `absolute` from the caller positions the button; otherwise it is `relative` (for its gloss layer).
      className={`lx-tile lx-gloss ${/\babsolute\b/.test(className) ? '' : 'relative'} flex items-center justify-center gap-2 rounded-full border-[4px] font-display font-black transition disabled:cursor-not-allowed disabled:opacity-55 disabled:grayscale-[0.4] ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Popup: dark overlay, crimson panel with a gold frame and a ribbon title. */
/**
 * A themed popup on the 1600×900 stage. `compact` keeps it inside the screen: smaller padding, the
 * whole popup at most `maxHeight` tall, and the content scrolls inside it (pass a fixed footer as
 * `footer` so the action buttons always stay visible).
 */
export function Modal({ title, children, onClose, width = 920, label, compact, maxHeight = 800, footer }: { title: string; children: ReactNode; onClose: () => void; width?: number; label?: string; compact?: boolean; maxHeight?: number; footer?: ReactNode }) {
  if (compact) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 pt-[36px]" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label={label ?? title} onClick={(e) => e.stopPropagation()} className="sp-pop lx-gold relative rounded-[36px] p-[8px] shadow-[0_10px_0_#5a2a00,0_16px_32px_rgb(0_0_0/0.5)]" style={{ width, maxWidth: 'calc(100% - 40px)', maxHeight }}>
          <div className="absolute -top-[34px] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[26px] border-[4px] border-[#ffd34d] bg-gradient-to-b from-[#c47cff] via-[#8f2ff0] to-[#5a12b0] px-8 py-1 font-display text-[36px] font-black text-white shadow-[0_6px_0_#36086e]">{title}</div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              play('tap');
              onClose();
            }}
            className="lx-tile absolute -right-[20px] -top-[20px] z-10 flex h-[66px] w-[66px] items-center justify-center rounded-full border-[4px] border-[#ffd34d] bg-gradient-to-b from-[#ff6b5c] to-[#c0101a] shadow-[0_5px_0_#6b0606]"
          >
            <svg viewBox="0 0 40 40" className="h-[30px] w-[30px]" aria-hidden="true">
              <path d="M10 10 L30 30 M30 10 L10 30" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex flex-col rounded-[30px] bg-gradient-to-b from-[#7a0f16] via-[#55070c] to-[#2e0306] px-8 pb-5 pt-9 text-white" style={{ maxHeight: maxHeight - 16 }}>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
            {footer && <div className="shrink-0 pt-3">{footer}</div>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label ?? title} onClick={(e) => e.stopPropagation()} className="sp-pop lx-gold relative rounded-[46px] p-[10px] shadow-[0_14px_0_#5a2a00,0_20px_40px_rgb(0_0_0/0.5)]" style={{ width }}>
        <div className="absolute -top-[42px] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[30px] border-[5px] border-[#ffd34d] bg-gradient-to-b from-[#c47cff] via-[#8f2ff0] to-[#5a12b0] px-10 py-2 font-display text-[44px] font-black text-white shadow-[0_7px_0_#36086e] drop-shadow-[0_3px_0_#2a0660]">{title}</div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => {
            play('tap');
            onClose();
          }}
          className="lx-tile absolute -right-[26px] -top-[26px] z-10 flex h-[84px] w-[84px] items-center justify-center rounded-full border-[5px] border-[#ffd34d] bg-gradient-to-b from-[#ff6b5c] to-[#c0101a] shadow-[0_6px_0_#6b0606]"
        >
          <svg viewBox="0 0 40 40" className="h-[38px] w-[38px]" aria-hidden="true">
            <path d="M10 10 L30 30 M30 10 L10 30" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
          </svg>
        </button>
        <div className="rounded-[38px] bg-gradient-to-b from-[#7a0f16] via-[#55070c] to-[#2e0306] px-12 pb-9 pt-14 text-white">{children}</div>
      </div>
    </div>
  );
}

/** A labelled row inside a popup. */
export function FieldRow({ label, children, error, hint }: { label: string; children: ReactNode; error?: string | null; hint?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-5">
        <span className="w-[230px] shrink-0 font-display text-[26px] font-black text-[#ffe9b0]">{label}</span>
        <div className="flex-1">{children}</div>
      </div>
      {(error || hint) && <p className={`ml-[250px] mt-1 text-[19px] font-bold ${error ? 'text-[#ff9aa8]' : 'text-white/60'}`}>{error ?? hint}</p>}
    </div>
  );
}

export const inputClass = 'h-[60px] w-full rounded-[18px] border-[3px] border-[#d9a441] bg-[#1d0306] px-5 text-[24px] font-bold text-white outline-none placeholder:text-white/35 focus:border-[#ffe14d]';

export function Select<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={String(value)}
        onChange={(e) => {
          const found = options.find(([v]) => String(v) === e.target.value);
          if (found) onChange(found[0]);
        }}
        className={`${inputClass} cursor-pointer appearance-none pr-14`}
      >
        {options.map(([v, text]) => (
          <option key={String(v)} value={String(v)} className="bg-[#2e0306]">
            {text}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-5 top-1/2 h-6 w-6 -translate-y-1/2" aria-hidden="true">
        <path d="M4 7 L10 13 L16 7" stroke="#ffe14d" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function EyeButton({ shown, onToggle, label }: { shown: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle} aria-label={shown ? `Hide ${label}` : `Show ${label}`} className="absolute right-3 top-1/2 -translate-y-1/2 p-2">
      <svg viewBox="0 0 40 40" className="h-[30px] w-[30px]" aria-hidden="true">
        <path d="M4 20 Q20 6 36 20 Q20 34 4 20Z" fill="none" stroke="#ffe9b0" strokeWidth="3" />
        <circle cx="20" cy="20" r="5" fill="#ffe9b0" />
        {!shown && <path d="M8 34 L32 6" stroke="#ffe9b0" strokeWidth="3.4" strokeLinecap="round" />}
      </svg>
    </button>
  );
}

export function TypeBadge({ type, className = '' }: { type: 'public' | 'private'; className?: string }) {
  return type === 'private' ? (
    <span className={`inline-flex items-center gap-2 rounded-full border-[3px] border-[#ffd34d] bg-gradient-to-b from-[#5a3a0a] to-[#2a1a02] px-4 py-1 font-display font-black text-[#ffe14d] ${className}`}>
      <Lock /> Private
    </span>
  ) : (
    <span className={`inline-flex items-center gap-2 rounded-full border-[3px] border-[#9aa6ff] bg-gradient-to-b from-[#3a2a9a] to-[#1a1260] px-4 py-1 font-display font-black text-white ${className}`}>
      <People /> Public
    </span>
  );
}

export function Lock({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <path d="M12 18 V12 a8 8 0 0 1 16 0 V18" stroke="#ffd34d" strokeWidth="4.5" fill="none" />
      <rect x="7" y="17" width="26" height="19" rx="4" fill="#ffd34d" />
      <circle cx="20" cy="26" r="3" fill="#5a3a0a" />
    </svg>
  );
}

export function People({ size = 24, color = '#ffffff' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 44 32" width={size * 1.3} height={size} aria-hidden="true">
      <circle cx="14" cy="10" r="6" fill={color} />
      <circle cx="30" cy="10" r="6" fill={color} opacity="0.85" />
      <path d="M3 30 C3 21 8 18 14 18 C20 18 25 21 25 30Z" fill={color} />
      <path d="M21 30 C21 22 25 18 30 18 C36 18 41 21 41 30Z" fill={color} opacity="0.85" />
    </svg>
  );
}
