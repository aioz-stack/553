'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import BeachLandscape from '@/components/BeachLandscape';
import FriendsPanel from '@/components/FriendsPanel';
import { Avatar, Diamond } from '@/components/game';
import { CandyText, CrownArt, ExitArt, GearArt, LogoCrest, RoundBankArt, SpeakerArt } from '@/components/HomeArt';
import { IconBell, IconGift, IconPlus, IconTrophy } from '@/components/icons';
import LandscapeStage, { useToStage } from '@/components/LandscapeStage';
import { Glitter, RimGlint } from '@/components/Sparkles';
import { springStyle } from '@/lib/spring';
import { Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { play, useSound } from '@/lib/sound';
import type { Level, TableState } from '@/lib/types';
import { useBalance } from '@/lib/useBalance';

/**
 * Landscape main menu (laid out on a 1600×900 stage that scales to the
 * screen): profile + level, logo crest, diamond (VC) balance, Friends List,
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

function SmallRound({ x, y, label, href, onClick, tone, children, dot, motion = '' }: { x: number; y: number; label: string; href?: string; onClick?: () => void; tone: string; children: ReactNode; dot?: boolean; motion?: string }) {
  const cls = `lx-tile lx-gloss lx-spring absolute flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-[#ffc531] bg-gradient-to-b ${tone} text-white shadow-[0_6px_0_#8a4a00,inset_0_-6px_10px_rgb(0_0_0/0.25)]`;
  const inner = (
    <>
      <RimGlint width={5} delay={(x % 7) / 3} />
      <span className={`relative z-[4] lx-glow ${motion}`}>{children}</span>
      {dot && <span className="lx-pulse-dot absolute -right-1 -top-1 z-[5] h-6 w-6 rounded-full border-4 border-white bg-red-500" />}
    </>
  );
  return href ? (
    <Link href={href} aria-label={label} className={cls} style={{ ...springStyle(label, 2.6, 1.2), left: x, top: y }} onClick={() => play('tap')}>
      {inner}
    </Link>
  ) : (
    <button type="button" aria-label={label} className={cls} style={{ ...springStyle(label, 2.6, 1.2), left: x, top: y }} onClick={onClick}>
      {inner}
    </button>
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

/** Lock the native app to landscape on this screen; other screens are portrait. */
function useLandscapeLock() {
  useEffect(() => {
    let native = false;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        native = Capacitor.isNativePlatform();
        if (!native) return;
        const { ScreenOrientation } = await import('@capacitor/screen-orientation');
        await ScreenOrientation.lock({ orientation: 'landscape' });
        const { StatusBar } = await import('@capacitor/status-bar');
        await StatusBar.hide();
      } catch {
        // web / plugin unavailable: the stage rotates itself instead
      }
    })();

    return () => {
      if (!native) return;
      (async () => {
        try {
          const { ScreenOrientation } = await import('@capacitor/screen-orientation');
          await ScreenOrientation.lock({ orientation: 'portrait' });
          const { StatusBar } = await import('@capacitor/status-bar');
          await StatusBar.show();
        } catch {
          // ignore
        }
      })();
    };
  }, []);
}

export default function Home() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { vc } = useBalance(user?.id);
  const stats = useFetch<{ data: { level: Level } }>(user ? '/profile/stats' : null);
  const wallet = useFetch<{ meta: { daily_reward_enabled: boolean; daily_reward_claimed: boolean } }>(user ? '/wallet' : null);
  const unread = useFetch<{ meta: { unread: number } }>(user ? '/notifications' : null).data?.meta.unread ?? 0;
  const [seat, setSeat] = useState<TableState | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [soundOn, toggleSound] = useSound();
  const diamonds = useCountUp(vc !== undefined ? Math.floor(Number(vc)) : undefined);

  useLandscapeLock();

  useEffect(() => {
    if (user) {
      api<{ data: TableState | null }>('/tables/current').then((r) => setSeat(r.data)).catch(() => undefined);
    }
  }, [user]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const level = stats.data?.data.level ?? user?.level;
  const name = user ? (user.display_name ?? user.name) : '';
  const xpPct = level ? Math.min(100, Math.round((level.into_level / level.for_next) * 100)) : 0;
  const bonus = wallet.data?.meta;

  const claim = async () => {
    try {
      const r = await api<{ message: string }>('/wallet/daily-reward', { method: 'POST' });
      play('win');
      setToast({ ok: true, text: r.message });
      wallet.reload();
      window.dispatchEvent(new Event('pusoy:wallet'));
    } catch (e) {
      setToast({ ok: false, text: errorText(e) });
    }
  };

  const signOut = async () => {
    play('tap');
    await logout();
    router.replace('/login/');
  };

  return (
    <Screen title="Home" immersive>
      <LandscapeStage background={<BeachLandscape className="h-full w-full" />}>
        {/* Profile */}
        <Link href="/profile/" aria-label="Profile" className="absolute left-[40px] top-[22px] flex items-center gap-4" onClick={() => play('tap')}>
          <span className="lx-gold lx-glow lx-spring-soft relative rounded-full p-[8px] shadow-[0_8px_0_#8a4a00]" style={springStyle('avatar', 4, 1)}>
            <span className="lx-gloss relative block rounded-full">
              <Avatar name={name} size={150} />
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
        </Link>

        {/* Logo */}
        <div className="absolute left-[500px] top-[0px]">
          <LogoCrest title="Pusoy 553" />
        </div>

        {/* Diamond balance */}
        <div style={springStyle('diamonds', 4.2, 1)} className="lx-gold lx-spring-soft absolute left-[1150px] top-[38px] flex h-[96px] w-[410px] items-center rounded-full p-[7px] shadow-[0_8px_0_#8a4a00]">
          <div className="lx-gloss relative flex h-full w-full items-center rounded-full bg-gradient-to-b from-[#24508f] to-[#0b1d45] pl-2 pr-2 shadow-[inset_0_-8px_14px_rgb(0_0_0/0.4)]">
            <span className="lx-glint relative z-[4] -ml-6 inline-block">
              <Diamond size={90} className="drop-shadow-[0_4px_4px_rgb(0_0_0/0.4)]" />
            </span>
            <Glitter count={6} seed={11} size={0.8} />
            <span className="lx-text-glow relative z-[4] flex-1 text-center font-display text-[48px] font-black text-white" aria-label="Diamond balance">
              {diamonds !== undefined ? diamonds.toLocaleString() : '…'}
            </span>
            <Link href="/wallet/" aria-label="Wallet" onClick={() => play('tap')} style={springStyle('plus', 2.4, 0.8)} className="lx-tile lx-spring relative z-[4] flex h-[70px] w-[70px] items-center justify-center rounded-full border-4 border-[#c8ffd8] bg-gradient-to-b from-[#5ef08a] to-[#13a344] text-white shadow-[0_4px_0_#0b6b2a,inset_0_3px_0_rgb(255_255_255/0.5)]">
              <RimGlint width={4} delay={1.5} />
              <IconPlus className="h-11 w-11" />
            </Link>
          </div>
        </div>

        {/* Quick icons under the balance */}
        {bonus?.daily_reward_enabled && (
          <SmallRound x={1290} y={152} label={bonus.daily_reward_claimed ? 'Daily bonus claimed' : 'Claim daily bonus'} onClick={claim} tone={bonus.daily_reward_claimed ? 'from-slate-400 to-slate-600' : 'from-candy-400 to-candy-500'} dot={!bonus.daily_reward_claimed} motion={bonus.daily_reward_claimed ? '' : 'lx-wiggle inline-block'}>
            <IconGift className="h-10 w-10" />
          </SmallRound>
        )}
        <SmallRound x={1380} y={152} label="Leaderboard" href="/leaderboard/" tone="from-[#ffd75a] to-[#e89a00]" motion="lx-bob inline-block">
          <IconTrophy className="h-10 w-10 text-[#5a2600]" />
        </SmallRound>
        <SmallRound x={1470} y={152} label="Notifications" href="/notifications/" tone="from-felt-400 to-felt-700" dot={unread > 0} motion={unread > 0 ? 'lx-ring inline-block' : ''}>
          <IconBell className="h-10 w-10" />
        </SmallRound>

        {/* Friends */}
        <div className="absolute left-[25px] top-[215px] h-[660px] w-[440px]">
          <FriendsPanel enabled={!!user} />
        </div>

        {/* Return to an active seat */}
        {seat && (
          <Link href={`/play/?table=${seat.id}`} className="absolute left-[560px] top-[222px] z-10 flex h-[46px] w-[930px] items-center justify-center gap-3 rounded-full border-4 border-[#4ee36b] bg-[#0f2a1c]/90 font-display text-[26px] font-black text-white">
            <span className="h-4 w-4 animate-ping rounded-full bg-[#4ee36b]" />
            You have a seat at {seat.room.name} — tap to return
          </Link>
        )}

        {/* Game modes */}
        <Tile x={495} y={278} w={520} h={350} from="#c477ff" to="#5a14b8" label="Round Bank" href="/lobby/?mode=round_bank">
          <span className="mt-2">
            <RoundBankArt />
          </span>
          <CandyText text="Round Bank" width={490} height={100} size={80} className="-mt-8" sweepDelay={0.4} />
        </Tile>
        <Tile x={1040} y={278} w={520} h={350} from="#ff6b5c" to="#9c0a12" label="Banker Mode" href="/lobby/?mode=banker" sweepDelay={1.2}>
          <span className="mt-2">
            <CrownArt />
          </span>
          <CandyText text="Banker Mode" width={490} height={100} size={76} className="-mt-8" sweepDelay={1.6} />
        </Tile>

        {/* Controls */}
        <Tile x={515} y={660} w={320} h={210} from="#c477ff" to="#6a1fc9" label={soundOn ? 'Sound on — tap to turn off' : 'Sound off — tap to turn on'} onClick={toggleSound} sweepDelay={2.0}>
          <SpeakerArt on={soundOn} />
          <CandyText text="Sound" width={300} height={56} size={46} stroke="#2b0a5c" fill={['#ffffff', '#ffffff', '#ece4ff']} className="-mt-1" sweepDelay={2.2} />
          <span className="-mt-1 font-display text-[34px] font-black leading-none drop-shadow-[0_3px_0_rgb(0_0_0/0.5)]">
            <span className={soundOn ? 'lx-text-glow text-[#ffe14d]' : 'text-white/40'}>ON</span>
            <span className="text-white/70"> / </span>
            <span className={soundOn ? 'text-white/40' : 'lx-text-glow text-[#ffe14d]'}>OFF</span>
          </span>
        </Tile>
        <Tile x={858} y={660} w={320} h={210} from="#6fd4ff" to="#1560d0" label="Settings" href="/settings/" sweepDelay={2.6}>
          <GearArt />
          <CandyText text="Settings" width={300} height={64} size={52} stroke="#0d3270" fill={['#ffffff', '#ffffff', '#e4f3ff']} sweepDelay={2.8} />
        </Tile>
        <Tile x={1201} y={660} w={320} h={210} from="#ff86b6" to="#d81b60" label="Logout" onClick={signOut} sweepDelay={3.2}>
          <ExitArt />
          <CandyText text="Logout" width={300} height={64} size={52} stroke="#6d0a33" fill={['#ffffff', '#ffffff', '#ffe4ef']} sweepDelay={3.4} />
        </Tile>

        {toast && (
          <div role="status" className={`absolute left-1/2 top-[150px] z-20 -translate-x-1/2 rounded-full border-4 px-8 py-3 font-display text-[28px] font-black shadow-lg ${toast.ok ? 'border-[#4ee36b] bg-[#0f2a1c] text-[#b9ffcb]' : 'border-red-400 bg-[#3a0d14] text-red-100'}`}>
            {toast.text}
          </div>
        )}
      </LandscapeStage>
    </Screen>
  );
}
