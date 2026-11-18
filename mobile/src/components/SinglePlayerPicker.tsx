'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { CandyText, GoldCoins } from '@/components/HomeArt';
import { Glitter } from '@/components/Sparkles';
import { useFetch } from '@/lib/hooks';
import { saveSelection, type PracticeTier, type SinglePlayerSelection } from '@/lib/singlePlayer';
import { play } from '@/lib/sound';

/**
 * Single Player → "Select Difficulty Level" overlay on the landscape home
 * (1600×900 stage coordinates). Four glossy tier cards (Beginner,
 * Intermediate, Advance, Mastery) showing their minimum gold and bet
 * options. The bet amounts are information only. Tapping a card selects
 * that difficulty and goes straight to its game, if the player's gold
 * meets the minimum; otherwise a notification explains why and nothing
 * starts. The server checks the gold again before dealing.
 */

const THEMES: Record<string, { from: string; to: string; edge: string; glow: string; stroke: string; dark: string }> = {
  beginner: { from: '#5fe07a', to: '#0c7a2e', edge: '#7dffa0', glow: '125 255 160', stroke: '#0a4a1c', dark: '#0d4a1f' },
  intermediate: { from: '#4fa6ff', to: '#0b38b0', edge: '#8ccaff', glow: '120 190 255', stroke: '#0a2470', dark: '#0b2a74' },
  advanced: { from: '#c77dff', to: '#5a12b0', edge: '#e2adff', glow: '210 140 255', stroke: '#3a0a72', dark: '#3c0d78' },
  mastery: { from: '#ff6464', to: '#a20a14', edge: '#ffa0a0', glow: '255 120 120', stroke: '#5c0610', dark: '#6a0812' },
};
const theme = (key: string) => THEMES[key] ?? THEMES.beginner;

const fmt = (n: number) => n.toLocaleString('en-US');

/** Gold-rimmed shield with 1–3 stars between laurels; Mastery wears a crown. */
function TierShield({ stars, crown, color }: { stars: number; crown: boolean; color: string }) {
  const id = useId().replace(/:/g, '');
  const xs = stars === 1 ? [0] : stars === 2 ? [-20, 20] : [-30, 0, 30];
  const star = 'M0 -15 L4.4 -4.8 L15 -4.6 L6.8 2.4 L9.6 13 L0 7 L-9.6 13 L-6.8 2.4 L-15 -4.6 L-4.4 -4.8Z';
  return (
    <svg width="210" height="128" viewBox="-105 -70 210 128" className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7c4" />
          <stop offset="0.45" stopColor="#ffc531" />
          <stop offset="1" stopColor="#b86500" />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.85" />
          <stop offset="1" stopColor="#140a35" />
        </linearGradient>
      </defs>
      {/* laurels */}
      {[-1, 1].map((s) => (
        <g key={s} transform={`scale(${s} 1)`} className="lx-sway" style={{ animationDelay: s > 0 ? '0.5s' : '0s' }}>
          {[0, 1, 2, 3].map((i) => (
            <ellipse key={i} cx={-62 - i * 6} cy={34 - i * 22} rx="15" ry="7" transform={`rotate(${-60 + i * 22} ${-62 - i * 6} ${34 - i * 22})`} fill={`url(#${id}g)`} stroke="#9a5b03" strokeWidth="1.5" />
          ))}
        </g>
      ))}
      {crown && (
        <g className="lx-bob" transform="translate(0 -58)">
          <path d="M-34 10 L-40 -22 L-18 -6 L0 -30 L18 -6 L40 -22 L34 10Z" fill={`url(#${id}g)`} stroke="#8a4a00" strokeWidth="3" strokeLinejoin="round" />
          <path d="M-8 -2 l8 -10 8 10 -8 10z" fill="#ff2d4d" stroke="#7a0a12" strokeWidth="2" />
          {[-40, 0, 40].map((x, i) => (
            <circle key={x} cx={x} cy={[-22, -30, -22][i]} r="5" fill="#fff3a0" stroke="#8a4a00" strokeWidth="1.5" />
          ))}
        </g>
      )}
      <path d="M0 -44 L52 -30 L52 6 C52 34 28 50 0 58 C-28 50 -52 34 -52 6 L-52 -30Z" fill={`url(#${id}g)`} stroke="#8a4a00" strokeWidth="4" strokeLinejoin="round" />
      <path d="M0 -34 L42 -23 L42 6 C42 28 22 41 0 48 C-22 41 -42 28 -42 6 L-42 -23Z" fill={`url(#${id}f)`} />
      <path d="M-40 -22 L0 -33 L40 -22 L40 -10 Q0 -24 -40 -10Z" fill="#fff" opacity="0.25" />
      {xs.map((x, i) => (
        <g key={x} transform={`translate(${x} ${stars === 3 && i === 1 ? -2 : 4}) scale(${stars === 1 ? 1.5 : 1})`}>
          <path d={star} fill={`url(#${id}g)`} stroke="#8a4a00" strokeWidth="2" strokeLinejoin="round" className="lx-twinkle-soft" style={{ animationDelay: `${i * 0.3}s` }} />
        </g>
      ))}
    </svg>
  );
}


function TierCard({ tier, index, state, onTap }: { tier: PracticeTier; index: number; state: 'idle' | 'selected' | 'dimmed' | 'denied'; onTap: () => void }) {
  const t = theme(tier.key);
  const locked = !tier.eligible;
  const style: CSSProperties = {
    ['--tier-glow' as string]: t.glow,
    animationDelay: `${0.08 * index}s`,
  };

  return (
    <button
      type="button"
      data-testid={`tier-${tier.key}`}
      data-selected={state === 'selected' ? 'true' : 'false'}
      aria-label={`${tier.name} — minimum gold ${fmt(tier.min_gold)}${locked ? ' (not enough gold)' : ''}`}
      aria-pressed={state === 'selected'}
      style={style}
      onClick={onTap}
      className={`sp-card relative block h-full w-full rounded-[40px] p-[8px] text-left ${state === 'selected' ? 'sp-card-selected' : ''} ${state === 'dimmed' ? 'sp-card-dim' : ''} ${state === 'denied' ? 'sp-card-denied' : ''} ${locked ? 'sp-card-locked' : ''}`}
    >
      <span className="lx-gold absolute inset-0 block rounded-[40px] shadow-[0_10px_0_#7a3e00,0_18px_30px_rgb(0_0_0/0.45)]" />
      <span className="lx-gloss relative flex h-full flex-col items-center rounded-[32px] px-4 pb-4 pt-1" style={{ background: `radial-gradient(120% 70% at 50% 18%, ${t.from}, ${t.to})`, boxShadow: `inset 0 0 0 4px ${t.edge}, inset 0 -12px 24px rgb(0 0 0 / .3)` }}>
        <Glitter count={8} seed={index * 13 + 5} size={0.9} />
        <span className="block h-[92px] shrink-0" />
        <CandyText text={tier.name} width={256} height={60} size={tier.name.length > 10 ? 38 : 46} stroke={t.stroke} fill={['#ffffff', '#ffffff', '#eef2ff']} className="relative z-[4] -mt-1" sweepDelay={index * 0.4} />

        <span className="relative z-[4] mt-1 flex h-[70px] w-full items-center gap-2 rounded-[18px] px-2 shadow-[inset_0_3px_8px_rgb(0_0_0/0.5)]" style={{ background: t.dark }}>
          <GoldCoins size={58} />
          <span className="flex flex-1 flex-col items-center leading-none">
            <span className="font-display text-[17px] font-extrabold text-white">Minimum Gold:</span>
            <span className="lx-text-glow mt-1 font-display text-[30px] font-black text-[#ffe14d] drop-shadow-[0_2px_0_#7a3e00]">{fmt(tier.min_gold)}</span>
          </span>
        </span>

        {/* Bet options: information only, not selectable. */}
        <span className="relative z-[4] mt-2 font-display text-[19px] font-extrabold text-white drop-shadow-[0_2px_0_rgb(0_0_0/0.5)]">Bet Options:</span>
        <span className="relative z-[4] mt-1 flex w-full flex-col gap-[8px]" aria-label={`${tier.name} bet options: ${tier.bets.map(fmt).join(', ')}`}>
          {tier.bets.map((bet) => (
            <span key={bet} data-testid="bet-note" className="sp-bet-note flex h-[44px] items-center justify-center gap-2 rounded-full border-[4px] border-[#ffc531] bg-gradient-to-b from-[#3b2410] to-[#1a0e04] font-display text-[25px] font-black text-white">
              <GoldCoins size={30} />
              <span>{fmt(bet)}</span>
            </span>
          ))}
        </span>

        {locked && (
          <span className="absolute right-3 top-3 z-[6] flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 font-display text-[16px] font-black text-white">
            <svg viewBox="0 0 40 48" className="h-5 w-4" aria-hidden="true">
              <path d="M10 22v-8a10 10 0 0 1 20 0v8" fill="none" stroke="#ffd13a" strokeWidth="5" />
              <rect x="4" y="20" width="32" height="26" rx="6" fill="#ffc531" stroke="#8a4a00" strokeWidth="3" />
            </svg>
            Locked
          </span>
        )}
      </span>
      {/* Outside the glossy face so the Mastery crown can rise above the card. */}
      <span className={`pointer-events-none absolute left-1/2 top-[-22px] z-[7] block -translate-x-1/2 ${locked ? 'opacity-70 grayscale' : ''}`}>
        <TierShield stars={tier.stars} crown={tier.crown} color={t.from} />
      </span>
      {state === 'selected' && (
        <span className="sp-tag absolute -bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full border-4 border-white bg-gradient-to-b from-[#5ef08a] to-[#13a344] px-4 py-0.5 font-display text-[20px] font-black text-white shadow-[0_4px_0_#0b6b2a]">
          LET&apos;S GO!
        </span>
      )}
    </button>
  );
}

/** The red "Single Player" banner with a gold rim, laurels and three aces. */
function Banner() {
  return (
    <div className="lx-bob-slow pointer-events-none absolute left-[430px] top-[52px] z-20 h-[210px] w-[740px]">
      <svg width="740" height="210" viewBox="0 0 740 210" className="absolute inset-0 overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="sp-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff7c4" />
            <stop offset="0.45" stopColor="#ffc531" />
            <stop offset="1" stopColor="#b86500" />
          </linearGradient>
          <linearGradient id="sp-red" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff6a4a" />
            <stop offset="0.55" stopColor="#e3201c" />
            <stop offset="1" stopColor="#a10d0b" />
          </linearGradient>
        </defs>
        {[
          [300, -14, 'A', '♠', '#141414'],
          [370, 0, 'A', '♥', '#e3172c'],
          [440, 14, 'A', '♣', '#141414'],
        ].map(([x, r, rank, suit, c]) => (
          <g key={String(x)} transform={`translate(${x} 48) rotate(${r})`}>
            <g className="lx-bob" style={{ animationDelay: `${(Number(x) - 300) / 140}s` }}>
              <rect x="-34" y="-46" width="68" height="92" rx="8" fill="#fff" stroke="#d8b25a" strokeWidth="3" />
              <text x="-22" y="-18" fontSize="26" fontWeight="900" fill={String(c)} fontFamily="Georgia, serif">
                {rank}
              </text>
              <text x="4" y="30" fontSize="40" textAnchor="middle" fill={String(c)}>
                {suit}
              </text>
            </g>
          </g>
        ))}
        {/* ribbon tails */}
        <path d="M40 120 L110 108 L110 176 L40 186 L66 152Z" fill="#a10d0b" stroke="#6b0606" strokeWidth="4" strokeLinejoin="round" />
        <path d="M700 120 L630 108 L630 176 L700 186 L674 152Z" fill="#a10d0b" stroke="#6b0606" strokeWidth="4" strokeLinejoin="round" />
        <path d="M90 92 Q370 50 650 92 L656 174 Q370 140 84 174Z" fill="url(#sp-rim)" stroke="#8a4a00" strokeWidth="5" />
        <path d="M104 104 Q370 66 636 104 L640 162 Q370 128 100 162Z" fill="url(#sp-red)" />
        <path d="M112 108 Q370 74 628 108 L628 122 Q370 88 112 122Z" fill="#fff" opacity="0.3" />
        {/* laurels */}
        {[-1, 1].map((s) => (
          <g key={s} transform={`translate(${s < 0 ? 96 : 644} 140) scale(${s} 1)`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <ellipse key={i} cx={-18 - i * 4} cy={-i * 20} rx="20" ry="9" transform={`rotate(${-55 + i * 14} ${-18 - i * 4} ${-i * 20})`} fill="url(#sp-rim)" stroke="#9a5b03" strokeWidth="2" />
            ))}
          </g>
        ))}
      </svg>
      <CandyText text="Single Player" width={520} height={96} size={78} className="absolute left-[110px] top-[86px]" sweepDelay={0.3} />
    </div>
  );
}


export default function SinglePlayerPicker({ onClose, onContinue }: { onClose: () => void; onContinue: (sel: SinglePlayerSelection) => void }) {
  const tiers = useFetch<{ data: PracticeTier[] }>('/practice/tiers');
  const [chosen, setChosen] = useState<string | null>(null);
  const [denied, setDenied] = useState<{ key: string; text: string } | null>(null);
  const going = useRef(false);
  const timers = useRef<number[]>([]);

  const list = tiers.data?.data ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !going.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /** Tap a difficulty: check gold, show feedback, then go straight to that game. */
  const choose = (tier: PracticeTier) => {
    if (going.current) return;

    if (!tier.eligible) {
      play('tap');
      setDenied({ key: tier.key, text: `Not enough gold for ${tier.name}. You need at least ${fmt(tier.min_gold)} gold.` });
      later(() => setDenied((d) => (d?.key === tier.key ? null : d)), 3200);
      return;
    }

    going.current = true;
    setDenied(null);
    setChosen(tier.key);
    play('start');
    const sel = { tier: tier.key };
    saveSelection(sel);
    // Let the selection glow show briefly before leaving.
    later(() => onContinue(sel), 450);
  };

  const close = () => {
    if (going.current) return;
    play('tap');
    onClose();
  };

  const stateOf = (key: string): 'idle' | 'selected' | 'dimmed' | 'denied' => {
    if (chosen) return chosen === key ? 'selected' : 'dimmed';
    return denied?.key === key ? 'denied' : 'idle';
  };

  return (
    <div className="absolute inset-0 z-40" role="dialog" aria-modal="true" aria-label="Single Player — Select Difficulty Level">
      <div className="sp-fade absolute inset-0 bg-[#0a0420]/70 backdrop-blur-[2px]" onClick={close} />

      <div className="sp-pop absolute left-[150px] top-[150px] h-[730px] w-[1300px]">
        <div className="lx-gold absolute inset-0 rounded-[56px] shadow-[0_14px_0_#7a3e00,0_30px_60px_rgb(0_0_0/0.6)]" />
        <div className="absolute inset-[12px] overflow-hidden rounded-[46px] bg-[radial-gradient(120%_90%_at_50%_0%,#4a2390,#1d0b4a_55%,#120630)] shadow-[inset_0_0_0_4px_#ffd95e,inset_0_10px_30px_rgb(0_0_0/0.5)]">
          <Glitter count={18} seed={42} size={1} />
        </div>

        <div className="absolute left-0 right-0 top-[92px] flex items-center justify-center gap-4">
          <span className="h-[3px] w-[120px] bg-gradient-to-r from-transparent to-[#ffd13a]" />
          <span className="lx-twinkle-soft text-[22px] text-[#ffd13a]">◆</span>
          <h2 className="font-display text-[42px] font-black text-white drop-shadow-[0_3px_0_rgb(0_0_0/0.6)]">Select Difficulty Level</h2>
          <span className="lx-twinkle-soft text-[22px] text-[#ffd13a]">◆</span>
          <span className="h-[3px] w-[120px] bg-gradient-to-l from-transparent to-[#ffd13a]" />
        </div>

        <div className="absolute left-[42px] right-[42px] top-[178px] h-[500px]">
          {tiers.loading && !tiers.data && (
            <div role="status" className="flex h-full items-center justify-center gap-4 font-display text-[32px] font-black text-white">
              <span className="h-12 w-12 animate-spin rounded-full border-[6px] border-[#ffd13a] border-t-transparent" />
              Loading levels…
            </div>
          )}
          {tiers.error && !tiers.data && (
            <div role="alert" className="flex h-full flex-col items-center justify-center gap-5 text-center font-display text-[30px] font-black text-white">
              <span>{tiers.error}</span>
              <button type="button" onClick={() => tiers.reload()} className="lx-tile rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] px-10 py-3 text-[30px] text-[#4a1d00] shadow-[0_6px_0_#8a4a00]">
                Try again
              </button>
            </div>
          )}
          {list.length > 0 && (
            <div className="grid h-full grid-cols-4 gap-[24px]">
              {list.map((tier, i) => (
                <TierCard key={tier.key} tier={tier} index={i} state={stateOf(tier.key)} onTap={() => choose(tier)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <Banner />

      {denied && (
        <div role="alert" className="sp-toast absolute left-1/2 top-[826px] z-50 -translate-x-1/2 whitespace-nowrap rounded-full border-4 border-[#ff8a8a] bg-[#3a0d14] px-8 py-3 font-display text-[28px] font-black text-[#ffe4e4] shadow-[0_8px_24px_rgb(0_0_0/0.5)]">
          {denied.text}
        </div>
      )}

      <button type="button" aria-label="Close" onClick={close} className="lx-tile sp-pop absolute left-[1390px] top-[120px] z-30 flex h-[96px] w-[96px] items-center justify-center rounded-full border-[6px] border-[#ffc531] bg-gradient-to-b from-[#ff6b6b] to-[#c0101a] shadow-[0_7px_0_#6b0606,inset_0_4px_0_rgb(255_255_255/0.45)]">
        <svg viewBox="0 0 40 40" className="h-12 w-12" aria-hidden="true">
          <path d="M10 10 L30 30 M30 10 L10 30" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
