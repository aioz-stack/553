'use client';

import { useState, type ReactNode } from 'react';
import { CandyText } from '@/components/HomeArt';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuality, type Quality } from '@/lib/motion';
import { useMusic } from '@/lib/music';
import { savePrefs } from '@/lib/prefs';
import { play, useSound } from '@/lib/sound';

/**
 * The Settings panel (1600×900 stage coordinates, inside a LandscapeStage so it
 * fits every screen size): Audio (BGM, Sound Effects), Motion Effects (Low /
 * Medium / High) and Change Password. Every choice applies at once on this
 * device and is saved with your account (lib/prefs → PUT /profile/preferences),
 * so it is the same after logging out and back in. The password is checked and
 * stored (hashed) by the server; the form checks the obvious things first.
 */

/** 8+ characters with at least one letter and one number (the server enforces the same). */
export function passwordProblem(f: { current: string; next: string; confirm: string }): string | null {
  if (!f.current || !f.next || !f.confirm) return 'Please fill in all three password fields.';
  if (f.next.length < 8 || !/[A-Za-z]/.test(f.next) || !/\d/.test(f.next)) return 'Password must be at least 8 characters and include letters and numbers.';
  if (f.next !== f.confirm) return 'The new password and confirmation do not match.';
  if (f.next === f.current) return 'The new password must be different from your current password.';
  return null;
}

// ---------------------------------------------------------------- small art

function Gear({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <g fill="#ffd34d" stroke="#b35a00" strokeWidth="1.5">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="16.5" y="2" width="7" height="9" rx="2" transform={`rotate(${i * 45} 20 20)`} />
        ))}
        <circle cx="20" cy="20" r="12" />
      </g>
      <circle cx="20" cy="20" r="5" fill="#e0262f" stroke="#b35a00" strokeWidth="1.5" />
    </svg>
  );
}

function Laurel({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 60 80" width="60" height="80" aria-hidden="true" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      <path d="M50 76 Q18 60 14 10" stroke="#c98a12" strokeWidth="4" fill="none" strokeLinecap="round" />
      {[14, 28, 42, 56].map((y, i) => (
        <ellipse key={i} cx={22 + i * 5} cy={y} rx="11" ry="5.5" transform={`rotate(${-50 + i * 8} ${22 + i * 5} ${y})`} fill="#ffcc33" stroke="#b37800" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

const IconMusic = () => (
  <svg viewBox="0 0 40 40" className="h-[46px] w-[46px]" aria-hidden="true">
    <path d="M15 30 V9 L33 5 V26" stroke="#8a1f12" strokeWidth="4" fill="none" strokeLinejoin="round" />
    <ellipse cx="11" cy="30" rx="6" ry="5" fill="#8a1f12" />
    <ellipse cx="29" cy="26" rx="6" ry="5" fill="#8a1f12" />
  </svg>
);
const IconSpeaker = ({ className = 'h-[46px] w-[46px]', color = '#c0262f' }: { className?: string; color?: string }) => (
  <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
    <path d="M5 15 H12 L22 6 V34 L12 25 H5Z" fill={color} />
    <path d="M27 14 Q31 20 27 26 M31 10 Q38 20 31 30" stroke={color} strokeWidth="3.2" fill="none" strokeLinecap="round" />
  </svg>
);
const IconScreen = () => (
  <svg viewBox="0 0 40 40" className="h-[38px] w-[38px]" aria-hidden="true">
    <rect x="4" y="6" width="32" height="21" rx="3" fill="#fff" stroke="#6a2a0c" strokeWidth="3" />
    <rect x="9" y="11" width="22" height="11" rx="1.5" fill="#ffd34d" />
    <path d="M14 34 H26 M20 27 V34" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
  </svg>
);
const IconLock = ({ className = 'h-[38px] w-[38px]', body = '#fff', stroke = '#6a2a0c' }: { className?: string; body?: string; stroke?: string }) => (
  <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
    <path d="M12 18 V12 a8 8 0 0 1 16 0 V18" stroke={stroke} strokeWidth="4" fill="none" />
    <rect x="7" y="17" width="26" height="19" rx="4" fill={body} stroke={stroke} strokeWidth="3" />
    <circle cx="20" cy="25" r="3" fill={stroke} />
    <rect x="18.5" y="25" width="3" height="6" rx="1" fill={stroke} />
  </svg>
);
const IconKey = () => (
  <svg viewBox="0 0 40 40" className="h-[40px] w-[40px]" aria-hidden="true">
    <circle cx="27" cy="13" r="8" fill="#c06a1c" />
    <circle cx="29" cy="11" r="2.6" fill="#fdf0dc" />
    <path d="M21 19 L7 33 M11 29 L15 33 M14 26 L17 29" stroke="#c06a1c" strokeWidth="4.5" strokeLinecap="round" />
  </svg>
);
const Eye = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 40 40" className="h-[30px] w-[30px]" aria-hidden="true">
    <path d="M4 20 Q20 6 36 20 Q20 34 4 20Z" fill="none" stroke="#6b5a4a" strokeWidth="3" />
    <circle cx="20" cy="20" r="5" fill="#6b5a4a" />
    {off && <path d="M8 34 L32 6" stroke="#6b5a4a" strokeWidth="3.4" strokeLinecap="round" />}
  </svg>
);

// ---------------------------------------------------------------- building blocks

function SectionTab({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative z-10 -mb-[22px] ml-4 inline-flex h-[50px] self-start items-center rounded-full bg-gradient-to-b from-[#a8521f] to-[#6a2a0c] pr-7 shadow-[0_4px_0_rgb(80_30_5/0.45)]">
      <span className="-ml-2 flex h-[60px] w-[66px] items-center justify-center rounded-[16px] border-[3px] border-[#ffe6a8] bg-gradient-to-b from-[#ffb347] to-[#e0700a] shadow-[0_3px_0_#8a3c00]">{icon}</span>
      <span className="ml-3 font-display text-[27px] font-black tracking-wide text-white drop-shadow-[0_2px_0_#3a1300]">{children}</span>
    </div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[28px] border-[3px] border-[#efcf9f] bg-[#f9e4c4] px-6 shadow-[inset_0_2px_0_#fff6e4] ${className}`}>{children}</div>;
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-[60px] w-[150px] shrink-0 rounded-full border-[4px] transition-colors ${on ? 'border-[#9cf08a] bg-gradient-to-b from-[#3fd04f] to-[#138a24] shadow-[0_5px_0_#0b5e18]' : 'border-[#e3cfb5] bg-gradient-to-b from-[#c9b49b] to-[#9a8268] shadow-[0_5px_0_#6b5640]'}`}
    >
      <span className={`absolute top-1/2 -translate-y-1/2 font-display text-[27px] font-black text-white drop-shadow-[0_2px_0_rgb(0_0_0/0.3)] ${on ? 'left-[16px]' : 'right-[16px]'}`}>{on ? 'ON' : 'OFF'}</span>
      <span className={`absolute left-[4px] top-1/2 h-[46px] w-[46px] -translate-y-1/2 rounded-full bg-gradient-to-b from-white to-[#dcdcdc] shadow-[0_3px_4px_rgb(0_0_0/0.35)] transition-transform ${on ? 'translate-x-[88px]' : 'translate-x-0'}`} />
    </button>
  );
}

function PasswordField({ icon, label, value, onChange, placeholder, autoComplete }: { icon: ReactNode; label: string; value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <label className="flex h-[56px] items-center gap-3 border-b-2 border-[#efcf9f] last:border-0">
      <span className="flex w-[44px] justify-center">{icon}</span>
      <span className="w-[270px] font-display text-[25px] font-black text-[#4a1d0a]">{label}</span>
      <span className="relative flex-1">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-label={label}
          className="h-[48px] w-full rounded-[14px] border-2 border-[#d9c2a3] bg-[#fffaf2] pl-4 pr-14 text-[22px] italic text-[#3a2410] outline-none placeholder:text-[#a8957f] focus:border-[#e0700a] focus:not-italic"
        />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? `Hide ${label}` : `Show ${label}`} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
          <Eye off={!show} />
        </button>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- the panel

const LEVELS: Array<[Quality, string]> = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [bgm] = useMusic();
  const [sfx] = useSound();
  const [quality] = useQuality();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const updatePassword = async () => {
    const problem = passwordProblem(form);
    if (problem) {
      setMessage({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api('/profile/password', { method: 'PUT', body: { current_password: form.current, password: form.next, password_confirmation: form.confirm } });
      setForm({ current: '', next: '', confirm: '' });
      setMessage({ ok: true, text: 'Your password has been changed.' });
      play('win');
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
      play('lose');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex justify-center bg-black/55" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()} className="sp-pop relative mt-[30px] h-[858px] w-[1060px] rounded-[58px] bg-gradient-to-b from-[#f9b25a] via-[#e8822c] to-[#b14d12] p-[12px] shadow-[0_14px_0_#6a2a0c,0_20px_40px_rgb(0_0_0/0.45)]">
        {/* header ribbon */}
        <div className="absolute -top-[40px] left-1/2 z-20 flex -translate-x-1/2 items-end">
          <Laurel />
          <div className="mx-[-8px] flex h-[96px] items-center gap-2 rounded-[40px] border-[5px] border-[#ffd34d] bg-gradient-to-b from-[#ff6fa5] via-[#ec2f78] to-[#b80f4f] px-8 shadow-[0_7px_0_#7a0a33]">
            <Gear size={62} />
            <CandyText text="SETTINGS" width={330} height={86} size={66} stroke="#7a0a33" fill={['#ffffff', '#ffffff', '#ffe4ef']} />
          </div>
          <Laurel flip />
        </div>
        {/* close */}
        <button
          type="button"
          aria-label="Close"
          onClick={() => {
            play('tap');
            onClose();
          }}
          className="lx-tile absolute -right-[30px] -top-[30px] z-20 flex h-[100px] w-[100px] items-center justify-center rounded-full border-[6px] border-[#ffd34d] bg-gradient-to-b from-[#ff6b5c] to-[#c0101a] shadow-[0_7px_0_#6b0606]"
        >
          <svg viewBox="0 0 40 40" className="h-[46px] w-[46px]" aria-hidden="true">
            <path d="M10 10 L30 30 M30 10 L10 30" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex h-full flex-col rounded-[48px] bg-gradient-to-b from-[#fff6e6] to-[#fbe7cb] relative px-10 pt-[52px]">
          {/* 1. Audio */}
          <SectionTab icon={<IconSpeaker className="h-[38px] w-[38px]" color="#fff" />}>AUDIO SETTINGS</SectionTab>
          <Card className="pb-2 pt-7">
            <div className="flex h-[60px] items-center gap-4 border-b-2 border-[#efcf9f]">
              <IconMusic />
              <span className="flex-1 leading-tight">
                <span className="block font-display text-[27px] font-black text-[#4a1d0a]">BGM</span>
                <span className="block text-[19px] font-bold text-[#7a5a3a]">(Background Music)</span>
              </span>
              <Toggle on={bgm} label="Background music" onClick={() => savePrefs({ bgm: !bgm })} />
            </div>
            <div className="flex h-[60px] items-center gap-4">
              <IconSpeaker />
              <span className="flex-1 leading-tight">
                <span className="block font-display text-[27px] font-black text-[#4a1d0a]">Sound Effects</span>
                <span className="block text-[19px] font-bold text-[#7a5a3a]">(In-Game Sounds)</span>
              </span>
              <Toggle on={sfx} label="Sound effects" onClick={() => savePrefs({ sfx: !sfx })} />
            </div>
          </Card>

          {/* 2. Motion effects */}
          <div className="mt-2 flex flex-col">
            <SectionTab icon={<IconScreen />}>MOTION EFFECTS</SectionTab>
          </div>
          <Card className="pb-4 pt-7">
            <p className="text-center text-[21px] font-bold text-[#5a3a1a]">Graphics and animation quality for a smoother gaming experience.</p>
            <div role="radiogroup" aria-label="Motion effects" className="mt-2 flex justify-between gap-4">
              {LEVELS.map(([value, label]) => {
                const on = quality === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      play('tap');
                      savePrefs({ motion: value });
                    }}
                    className={`flex h-[60px] flex-1 items-center justify-center gap-4 rounded-full border-[4px] font-display text-[30px] font-black transition ${on ? 'border-[#ffe14d] bg-gradient-to-b from-[#4fe05f] to-[#139a2a] text-white shadow-[0_6px_0_#0b5e18]' : 'border-[#f3d2a6] bg-gradient-to-b from-[#ffe2bd] to-[#f2bd84] text-[#6a2a0c] shadow-[0_5px_0_#c4844a]'}`}
                  >
                    <span className={`flex h-[38px] w-[38px] items-center justify-center rounded-full border-[4px] ${on ? 'border-white' : 'border-[#8a4a1c]'}`}>
                      {on && (
                        <svg viewBox="0 0 20 20" className="h-[22px] w-[22px]" aria-hidden="true">
                          <path d="M4 10 L8.5 14.5 L16 5.5" stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* 3. Change password */}
          <div className="mt-2 flex flex-col">
            <SectionTab icon={<IconLock />}>CHANGE PASSWORD</SectionTab>
          </div>
          <Card className="pb-1 pt-6">
            <PasswordField icon={<IconKey />} label="Current Password" value={form.current} onChange={(v) => setForm({ ...form, current: v })} placeholder="Enter current password" autoComplete="current-password" />
            <PasswordField icon={<IconLock className="h-[38px] w-[38px]" body="#c06a1c" stroke="#7a3a0c" />} label="New Password" value={form.next} onChange={(v) => setForm({ ...form, next: v })} placeholder="Enter new password" autoComplete="new-password" />
            <PasswordField icon={<IconLock className="h-[38px] w-[38px]" body="#c06a1c" stroke="#7a3a0c" />} label="Confirm New Password" value={form.confirm} onChange={(v) => setForm({ ...form, confirm: v })} placeholder="Confirm new password" autoComplete="new-password" />
          </Card>

          <div
            role={message ? (message.ok ? 'status' : 'alert') : undefined}
            className={`mx-auto mt-2 flex h-[42px] items-center gap-3 rounded-full px-6 text-[20px] font-bold ${message?.ok ? 'bg-[#d7f8d4] text-[#106a1f]' : message ? 'bg-[#ffd4d8] text-[#b0102a]' : 'bg-[#fbd9df] text-[#b0102a]'}`}
          >
            <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border-[3px] border-current font-display text-[17px] font-black">{message?.ok ? '✓' : 'i'}</span>
            <span className="truncate">{message?.text ?? 'Password must be at least 8 characters and include letters and numbers.'}</span>
          </div>

          <div className="mt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={updatePassword}
              disabled={busy || !user}
              className="lx-tile flex h-[74px] w-[500px] items-center justify-center gap-4 rounded-full border-[5px] border-[#fff07a] bg-gradient-to-b from-[#56e865] to-[#119a28] font-display text-[34px] font-black text-white shadow-[0_7px_0_#0b5e18] drop-shadow-[0_2px_0_rgb(0_0_0/0.2)] disabled:opacity-70"
            >
              <svg viewBox="0 0 40 40" className="h-[40px] w-[40px]" aria-hidden="true">
                <path d="M31 15 A12 12 0 0 0 9 13 M9 25 A12 12 0 0 0 31 27" stroke="#fff" strokeWidth="4.5" fill="none" strokeLinecap="round" />
                <path d="M31 6 V15 H22 M9 34 V25 H18" stroke="#fff" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {busy ? 'UPDATING…' : 'UPDATE PASSWORD'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
