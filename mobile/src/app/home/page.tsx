'use client';

import Link from 'next/link';
import AvatarPicker from '@/components/AvatarPicker';
import OutOfGoldPopup from '@/components/OutOfGoldPopup';
import SettingsPanel from '@/components/SettingsPanel';
import SinglePlayerPicker from '@/components/SinglePlayerPicker';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import BeachLandscape from '@/components/BeachLandscape';
import FriendsPanel from '@/components/FriendsPanel';
import WalletStack from '@/components/lobby/WalletStack';
import ShopModal from '@/components/lobby/ShopModal';
import { Avatar } from '@/components/game';
import { CandyText, CrownArt, ExitArt, GearArt, LogoCrest, RoundBankArt } from '@/components/HomeArt';
import LandscapeStage, { useToStage } from '@/components/LandscapeStage';
import { Glitter } from '@/components/Sparkles';
import { springStyle } from '@/lib/spring';
import { Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { play } from '@/lib/sound';
import type { Level, TableState } from '@/lib/types';
import { useBalance } from '@/lib/useBalance';
import { useResumeMatch } from '@/lib/useResumeMatch';
import { useGoldWallet } from '@/lib/useGoldWallet';
import { fetchGold, type GoldWallet } from '@/lib/gold';
import { practiceUrl } from '@/lib/singlePlayer';
import { useLandscapeLock } from '@/lib/useLandscapeLock';

/**
 * Landscape main menu (laid out on a 1600×900 stage that scales to the
 * screen): profile + level, logo crest, Gold and Chips balances, Friends List,
 * Round Bank / Banker Mode, Sound, Settings and Logout. Everything is live:
 * balances update over the private wallet channel, friends come from the API.
 */

interface Burst {
  id: number;
  x: number;
  y: number;
}

/** Gold star particles that fly out from a tap point (stage coordinates, relative to the element). */
function useBursts() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const fire = (x: number, y: number) => {
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, { id, x, y }]);
    setTimeout(() => setBursts((b) => b.filter((p) => p.id !== id)), 750);
  };
  const layer = bursts.map((b) => (
    <span key={b.id} className="pointer-events-none absolute" style={{ left: b.x, top: b.y }}>
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + b.id;
        const dist = 90 + ((i * 37) % 60);
        return (
          <svg key={i} viewBox="-18 -18 36 36" className="lx-burst-star" style={{ ['--dx' as string]: `${Math.cos(a) * dist}px`, ['--dy' as string]: `${Math.sin(a) * dist}px` }}>
            <path d="M0 -18 L4 -4 L18 0 L4 4 L0 18 L-4 4 L-18 0 L-4 -4Z" fill={i % 3 ? '#ffe14d' : '#ffffff'} stroke="#c47300" strokeWidth="1.5" />
          </svg>
        );
      })}
    </span>
  ));
  return { fire, layer };
}

/**
 * Big glossy tile: shimmering gold frame, glossy dome with a light sweep,
 * tilts toward the finger/mouse, lifts on hover, squishes on press and
 * throws gold stars where it is tapped.
 */
function Tile({ x, y, w, h, from, to, label, onClick, href, children, sweepDelay = 0 }: { x: number; y: number; w: number; h: number; from: string; to: string; label: string; onClick?: () => void; href?: string; children: ReactNode; sweepDelay?: number }) {
  const toStage = useToStage();
  const { fire, layer } = useBursts();
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const local = (e: { clientX: number; clientY: number }) => {
    const p = toStage(e.clientX, e.clientY);
    return { lx: p.x - x, ly: p.y - y };
  };
  const onMove = (e: ReactPointerEvent) => {
    const { lx, ly } = local(e);
    setTilt({ rx: (0.5 - ly / h) * 10, ry: (lx / w - 0.5) * 12 });
  };
  const onDown = (e: ReactPointerEvent) => {
    const { lx, ly } = local(e);
    fire(lx, ly);
    onMove(e);
  };

  const body = (
    <span style={{ ['--glint-delay' as string]: `${sweepDelay}s` }} className="lx-gold relative block h-full w-full rounded-[44px] p-[11px] shadow-[0_12px_0_#8a4a00,0_22px_36px_rgb(0_0_0/0.4),inset_0_2px_0_rgb(255_255_255/0.8)]">
      <span
        className="lx-gloss relative flex h-full w-full flex-col items-center justify-center rounded-[34px] shadow-[inset_0_-10px_24px_rgb(0_0_0/0.3),inset_0_4px_0_rgb(255_255_255/0.35)]"
        style={{ background: `radial-gradient(120% 90% at 50% 22%, ${from}, ${to})`, ['--sweep-delay' as string]: `${sweepDelay}s` }}
      >
        <Glitter count={10} seed={Math.round(x + y)} />
        {children}
      </span>
      {/* gold corner studs */}
      {[
        ['left-[14px] top-[14px]'],
        ['right-[14px] top-[14px]'],
        ['left-[14px] bottom-[14px]'],
        ['right-[14px] bottom-[14px]'],
      ].map(([pos]) => (
        <span key={pos} className={`absolute ${pos} z-10 h-[14px] w-[14px] rounded-full bg-gradient-to-br from-[#fffbe0] to-[#e09000] shadow-[0_1px_2px_rgb(0_0_0/0.5)]`} />
      ))}
      {layer}
    </span>
  );
  const props = {
    'aria-label': label,
    className: 'lx-tile lx-spring absolute block touch-manipulation',
    style: { ...springStyle(label, 3.2, 1.4), left: x, top: y, width: w, height: h, ['--rx' as string]: `${tilt.rx}deg`, ['--ry' as string]: `${tilt.ry}deg` },
    onPointerMove: onMove,
    onPointerDown: onDown,
    onPointerLeave: () => setTilt({ rx: 0, ry: 0 }),
  };

  return href ? (
    <Link href={href} {...props} onClick={() => play('tap')}>
      {body}
    </Link>
  ) : (
    <button type="button" {...props} onClick={onClick}>
      {body}
    </button>
  );
}

/** Shop tile art: a glossy shopping bag with a gold tag. */
function ShopArt() {
  return (
    <svg width="120" height="104" viewBox="0 0 120 104" aria-hidden="true" className="drop-shadow-[0_6px_6px_rgb(0_0_0/0.35)]">
      <path d="M42 30 C42 10 78 10 78 30" fill="none" stroke="#7a3e00" strokeWidth="7" strokeLinecap="round" />
      <path d="M42 30 C42 10 78 10 78 30" fill="none" stroke="#ffd34d" strokeWidth="4" strokeLinecap="round" />
      <path d="M22 30 H98 L92 96 H28 Z" fill="#ff4a8a" stroke="#7a0a33" strokeWidth="3" strokeLinejoin="round" />
      <path d="M26 30 H94 L93 44 H27 Z" fill="#ff86b6" />
      <circle cx="44" cy="44" r="4" fill="#7a0a33" />
      <circle cx="76" cy="44" r="4" fill="#7a0a33" />
      <rect x="44" y="58" width="32" height="24" rx="6" fill="#ffd34d" stroke="#7a3e00" strokeWidth="2.5" />
      <text x="60" y="76" textAnchor="middle" fontSize="16" fontWeight="900" fill="#7a3e00" fontFamily="system-ui">553</text>
    </svg>
  );
}

/** Animates a number from its previous value to the new one. */
function useCountUp(target: number | undefined): number | undefined {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    if (target === undefined) return undefined;
    const start = from.current ?? target;
    from.current = target;
    if (start === target) {
      setShown(target);
      return undefined;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setShown(Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return shown;
}

export default function Home() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { chips, keys } = useBalance(user?.id);
  // Single Player Gold wallet (Total Amount): the same server source as the game screens.
  const { wallet: goldWallet } = useGoldWallet(user?.id);
  const stats = useFetch<{ data: { level: Level } }>(user ? '/profile/stats' : null);
  const [seat, setSeat] = useState<TableState | null>(null);
  const [picker, setPicker] = useState(false);
  const [settings, setSettings] = useState(false);
  const [panel, setPanel] = useState<'shop' | null>(null);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const chipCount = useCountUp(chips !== undefined ? Math.floor(Number(chips)) : undefined);
  const keyCount = useCountUp(keys !== undefined ? Math.floor(Number(keys)) : undefined);
  const coins = useCountUp(goldWallet ? Math.floor(Number(goldWallet.total ?? goldWallet.gold)) : undefined);
  // Single Player Out of Gold: the free Gold popup (never shown for Multiplayer).
  const [outOfGold, setOutOfGold] = useState<GoldWallet | null>(null);

  useLandscapeLock();
  // Reconnect: if a match you are seated in is still being played, go straight back to it.
  useResumeMatch(user?.id);

  /** Single Player: Out of Gold opens the free Gold popup instead of the level picker. */
  const openPicker = async () => {
    play('tap');
    try {
      const g = await fetchGold();
      if (g.out_of_gold) {
        setOutOfGold(g);
        return;
      }
    } catch {
      // the picker and the server still check the Gold before any round
    }
    setPicker(true);
  };

  // Single Player sends you here with ?gold=out when you run out of Gold.
  useEffect(() => {
    if (!user || new URLSearchParams(window.location.search).get('gold') !== 'out') return;
    window.history.replaceState(null, '', '/home/');
    fetchGold()
      .then((g) => (g.out_of_gold ? setOutOfGold(g) : undefined))
      .catch(() => undefined);
  }, [user]);

  // "Change level" from the practice screen comes back here with ?single=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('single') === '1') {
      setPicker(true);
      window.history.replaceState(null, '', '/home/');
    }
  }, []);

  useEffect(() => {
    if (user) {
      api<{ data: TableState | null }>('/tables/current').then((r) => setSeat(r.data)).catch(() => undefined);
    }
  }, [user]);

  const level = stats.data?.data.level ?? user?.level;
  const name = user ? (user.display_name ?? user.name) : '';
  const xpPct = level ? Math.min(100, Math.round((level.into_level / level.for_next) * 100)) : 0;

  const signOut = async () => {
    play('tap');
    await logout();
    router.replace('/login/');
  };

  return (
    <Screen title="Home" immersive>
      <LandscapeStage background={<BeachLandscape className="h-full w-full" />}>
        {/* Profile (display only — not clickable; the pencil badge opens Choose Your Avatar) */}
        <div role="group" aria-label="Profile" className="absolute left-[40px] top-[22px] flex items-center gap-4">
          <span className="lx-gold lx-glow lx-spring-soft relative rounded-full p-[8px] shadow-[0_8px_0_#8a4a00]" style={springStyle('avatar', 4, 1)}>
            <span className="lx-gloss relative block rounded-full">
              <Avatar name={name} size={150} avatar={user?.avatar} userId={user?.id} />
            </span>
          </span>
          <span className="flex flex-col">
            <CandyText text={name.length > 14 ? `${name.slice(0, 13)}…` : name} width={340} height={70} size={52} stroke="#3a2210" fill={['#ffffff', '#ffffff', '#f2ece0']} sweepDelay={0.8} />
            <span className="lx-gold relative mt-1 flex h-[52px] w-[330px] items-center rounded-full p-[5px] shadow-[0_5px_0_#8a4a00]">
              <span className="flex h-full w-full items-center gap-2 rounded-full bg-[#241433] pr-2">
              <span className="ml-[-2px] flex h-[44px] items-center rounded-full bg-gradient-to-b from-[#ffd75a] to-[#e89a00] px-3 font-display text-[28px] font-black text-[#5a2600]">Lv. {level?.level ?? 1}</span>
              <span className="h-[22px] flex-1 overflow-hidden rounded-full bg-black/60" aria-label={`${xpPct}% to next level`}>
                <span className="lx-gold relative block h-full rounded-full" style={{ width: `${xpPct}%`, transition: 'width 1s ease' }} />
              </span>
              </span>
            </span>
          </span>
        </div>

        {/* Logo */}
        <div className="absolute left-[488px] top-[0px]">
          <LogoCrest title="Pusoy 553" />
        </div>

        {/* Wallets (upper right, top to bottom): Gold (Single Player), Chips (Multiplayer), Keys — three
            separate server balances, live and information only; the Keys (+) opens the Shop to buy Keys. */}
        <WalletStack className="absolute right-[24px] top-[50px] z-10" gold={coins} chips={chipCount} keys={keyCount} onBuyKeys={() => setPanel('shop')} />


        {/* Friends */}
        <div className="absolute left-[25px] top-[215px] h-[660px] w-[440px]">
          <FriendsPanel enabled={!!user} />
        </div>

        {/* Return to an active seat */}
        {seat && (
          <Link href={`/play/?table=${seat.id}`} className="absolute left-[495px] top-[228px] z-10 flex h-[46px] w-[640px] items-center justify-center gap-3 rounded-full border-4 border-[#4ee36b] bg-[#0f2a1c]/90 font-display text-[26px] font-black text-white">
            <span className="h-4 w-4 animate-ping rounded-full bg-[#4ee36b]" />
            You have a seat at {seat.room.name} — tap to return
          </Link>
        )}

        {/* Play: Single Player opens the difficulty picker (practice vs server bots, no coins move); Multiplayer = lobby (Classic, Round Bank, Banker Mode) */}
        <Tile x={495} y={284} w={520} h={350} from="#c477ff" to="#5a14b8" label="Single Player" onClick={openPicker}>
          <span className="mt-2">
            <RoundBankArt />
          </span>
          <CandyText text="Single Player" width={490} height={100} size={74} className="-mt-8" sweepDelay={0.4} />
        </Tile>
        <Tile x={1040} y={284} w={520} h={350} from="#ff6b5c" to="#9c0a12" label="Multiplayer" href="/lobby/" sweepDelay={1.2}>
          <span className="mt-2">
            <CrownArt />
          </span>
          <CandyText text="Multiplayer" width={490} height={100} size={78} className="-mt-8" sweepDelay={1.6} />
        </Tile>

        {/* Controls */}
        {/* Shop (Sound is in Settings) */}
        <Tile x={515} y={660} w={320} h={210} from="#5ef08a" to="#0f7a34" label="Shop" onClick={() => { play('tap'); setPanel('shop'); }} sweepDelay={2.0}>
          <ShopArt />
          <CandyText text="Shop" width={300} height={64} size={52} stroke="#0b4a20" fill={['#ffffff', '#ffffff', '#e4ffe9']} sweepDelay={2.2} />
        </Tile>
        <Tile x={858} y={660} w={320} h={210} from="#6fd4ff" to="#1560d0" label="Settings" onClick={() => setSettings(true)} sweepDelay={2.6}>
          <GearArt />
          <CandyText text="Settings" width={300} height={64} size={52} stroke="#0d3270" fill={['#ffffff', '#ffffff', '#e4f3ff']} sweepDelay={2.8} />
        </Tile>
        <Tile x={1201} y={660} w={320} h={210} from="#ff86b6" to="#d81b60" label="Logout" onClick={signOut} sweepDelay={3.2}>
          <ExitArt />
          <CandyText text="Logout" width={300} height={64} size={52} stroke="#6d0a33" fill={['#ffffff', '#ffffff', '#ffe4ef']} sweepDelay={3.4} />
        </Tile>

        {settings && <SettingsPanel onClose={() => setSettings(false)} />}
        {panel === 'shop' && <ShopModal onClose={() => setPanel(null)} />}
        {avatarPicker && <AvatarPicker onClose={() => setAvatarPicker(false)} />}
        {/* Change avatar / nickname: the pencil badge on your portrait (the only clickable part of the profile). */}
        <button
          type="button"
          aria-label="Change avatar"
          onClick={() => {
            play('tap');
            setAvatarPicker(true);
          }}
          className="lx-tile absolute left-[150px] top-[136px] z-10 flex h-[54px] w-[54px] items-center justify-center rounded-full border-[4px] border-white bg-gradient-to-b from-[#ffd34d] to-[#e08a00] text-[26px] text-[#4a1d00] shadow-[0_4px_0_#8a4a00]"
        >
          ✎
        </button>
        {outOfGold && (
          <OutOfGoldPopup
            initial={outOfGold}
            onClose={() => setOutOfGold(null)}
            onPlay={() => {
              setOutOfGold(null);
              setPicker(true);
            }}
          />
        )}
        {picker && <SinglePlayerPicker onClose={() => setPicker(false)} onContinue={(sel) => router.push(practiceUrl(sel))} />}

      </LandscapeStage>
    </Screen>
  );
}
