'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CardFaceArt } from '@/components/CardArt';
import FriendsPanel from '@/components/FriendsPanel';
import LandscapeStage from '@/components/LandscapeStage';
import CreateLobbyModal from '@/components/lobby/CreateLobbyModal';
import { EntryTerms } from '@/components/lobby/EntryTerms';
import ShopModal from '@/components/lobby/ShopModal';
import { CandyButton, EyeButton, ChipMark, Lock, Modal, People, TypeBadge, inputClass } from '@/components/lobby/LobbyUI';
import AvatarPicker from '@/components/AvatarPicker';
import SettingsPanel from '@/components/SettingsPanel';
import { LanternRoom } from '@/components/table/TableArt';
import { Avatar, KeyIcon } from '@/components/game';
import { Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { entryProblem, fmtChips, keysLabel, useLobbyUpdates, type LobbyDetail, type LobbyList, type LobbySummary, type LobbyTab } from '@/lib/lobby';
import { savePrefs } from '@/lib/prefs';
import { play, useSound } from '@/lib/sound';
import { useBalance } from '@/lib/useBalance';
import { useLandscapeLock } from '@/lib/useLandscapeLock';
import { useResumeMatch } from '@/lib/useResumeMatch';

/**
 * Multiplayer Lobby — the 553 Lobby (1600×900 stage). Lists open Chips lobbies (All / Public /
 * Private, search by name or Lobby ID, 5 per page), live-updated over Reverb (`lobbies` channel)
 * with a polling fallback. Quick Join finds an open public lobby you can afford; Create Lobby opens
 * the popup; Join (with the password for a private lobby) takes you to the Waiting Room. All rules,
 * balances and seats are decided by the server (LobbyService).
 */

const roomUrl = (id: number) => `/lobby/room/?id=${id}`;

function TopIcon({ label, onClick, href, badge, children }: { label: string; onClick?: () => void; href?: string; badge?: number; children: ReactNode }) {
  const cls = 'lx-tile relative flex h-[92px] w-[92px] items-center justify-center rounded-full border-[5px] border-[#ffc531] bg-gradient-to-b from-[#8a1a1f] to-[#3a0406] shadow-[0_6px_0_#1a0204]';
  const inner = (
    <>
      {children}
      {!!badge && <span className="absolute -right-1 -top-1 flex h-[34px] min-w-[34px] items-center justify-center rounded-full border-[3px] border-white bg-[#e0262f] px-1 font-display text-[18px] font-black text-white">{badge > 9 ? '9+' : badge}</span>}
    </>
  );
  return href ? (
    <Link href={href} aria-label={label} className={cls} onClick={() => play('tap')}>
      {inner}
    </Link>
  ) : (
    <button type="button" aria-label={label} className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

function SideItem({ label, onClick, href, children }: { label: string; onClick?: () => void; href?: string; children: ReactNode }) {
  const body = (
    <>
      <span className="flex h-[78px] items-center justify-center">{children}</span>
      <span className="font-display text-[22px] font-black text-white drop-shadow-[0_2px_0_rgb(0_0_0/0.6)]">{label}</span>
    </>
  );
  const cls = 'lx-tile flex w-full flex-col items-center py-2';
  return href ? (
    <Link href={href} className={cls} onClick={() => play('tap')}>
      {body}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  );
}

/** Centre crest: three cards (5♠ 5♥ 3♦) over the crowned gold 553. */
function LobbyCrest() {
  return (
    <div className="pointer-events-none relative h-[250px] w-[400px]">
      {[
        ['5S', -16, 92],
        ['5H', 0, 160],
        ['3D', 16, 228],
      ].map(([c, r, x]) => (
        <span key={c as string} className="absolute top-[6px] h-[112px] w-[80px] overflow-hidden rounded-[8px] bg-white shadow-[0_6px_10px_rgb(0_0_0/0.45)]" style={{ left: x as number, transform: `rotate(${r}deg)` }}>
          <CardFaceArt code={c as string} className="h-full w-full" />
        </span>
      ))}
      <svg viewBox="0 0 400 160" className="absolute left-0 top-[86px] h-[160px] w-[400px]" aria-hidden="true">
        <defs>
          <linearGradient id="lc-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff4b8" />
            <stop offset="0.5" stopColor="#f2c64a" />
            <stop offset="1" stopColor="#b07a0e" />
          </linearGradient>
          <linearGradient id="lc-red" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e3283c" />
            <stop offset="1" stopColor="#7c0612" />
          </linearGradient>
        </defs>
        {[-1, 1].map((s) => (
          <g key={s} transform={`translate(200 80) scale(${s} 1)`}>
            {Array.from({ length: 6 }, (_, i) => (
              <ellipse key={i} cx={-118 + i * 4} cy={-40 + i * 14} rx="16" ry="7" transform={`rotate(${-60 + i * 14} ${-118 + i * 4} ${-40 + i * 14})`} fill="url(#lc-gold)" stroke="#7a4a00" strokeWidth="1.2" />
            ))}
          </g>
        ))}
        <path d="M96 30 H304 Q316 30 316 42 V98 Q316 112 200 150 Q84 112 84 98 V42 Q84 30 96 30Z" fill="url(#lc-red)" stroke="url(#lc-gold)" strokeWidth="7" />
        <path d="M168 28 L172 6 L186 18 L200 0 L214 18 L228 6 L232 28Z" fill="url(#lc-gold)" stroke="#7a4a00" strokeWidth="2" />
        <text x="200" y="104" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="900" fontSize="78" fill="url(#lc-gold)" stroke="#3a1300" strokeWidth="4" paintOrder="stroke">
          553
        </text>
        <text x="200" y="134" textAnchor="middle" fontSize="20" fill="#ffe14d">
          ♠ ♥ ♦ ♣
        </text>
      </svg>
    </div>
  );
}

function StatusCell({ lobby, onJoin, busy }: { lobby: LobbySummary; onJoin: () => void; busy: boolean }) {
  if (lobby.is_mine) {
    return (
      <CandyButton tone="green" onClick={onJoin} className="h-[48px] w-[170px] text-[24px]">
        ▶ Return
      </CandyButton>
    );
  }
  if (!lobby.can_join) {
    return <span className="inline-flex h-[48px] w-[170px] items-center justify-center rounded-full border-[3px] border-white/25 bg-black/35 font-display text-[22px] font-black text-white/70">{lobby.status === 'in_game' ? 'In Game' : lobby.status === 'full' ? 'Full' : 'Closed'}</span>;
  }
  return (
    <CandyButton tone="gold" onClick={onJoin} disabled={busy} label={`Join ${lobby.name}`} className="h-[48px] w-[170px] text-[26px]">
      ▶ Join
    </CandyButton>
  );
}

export default function MultiplayerLobby() {
  const { user } = useAuth();
  const router = useRouter();
  const { chips, keys: keysBalance } = useBalance(user?.id);
  const [soundOn] = useSound();
  useLandscapeLock();
  // Reconnect: if a match you are seated in is still being played, go straight back to it.
  useResumeMatch(user?.id);

  const [tab, setTab] = useState<LobbyTab>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<LobbyList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [panel, setPanel] = useState<'create' | 'settings' | 'friends' | 'avatar' | 'shop' | null>(null);
  // Leaving the Multiplayer Lobby while seated in a lobby that has not started: confirm first.
  const [leaveAsk, setLeaveAsk] = useState<LobbyDetail | null>(null);
  const [joinFor, setJoinFor] = useState<LobbySummary | null>(null);
  const [leaving, setLeaving] = useState(false);

  const say = useCallback((ok: boolean, text: string) => setToast({ ok, text }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api<LobbyList>('/lobbies', { query: { tab, search: query || undefined, page } });
      setList(r);
      if (r.meta.page !== page) setPage(r.meta.page);
    } catch (e) {
      say(false, errorText(e));
    } finally {
      setLoading(false);
    }
  }, [user, tab, query, page, say]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);
  useLobbyUpdates(load, !!user);


  // Search: apply after a short pause; changing the tab or the search resets to page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const balance = chips !== undefined ? Number(chips) : undefined;
  const keyCount = keysBalance !== undefined ? Number(keysBalance) : undefined;

  /** Go to a lobby's Choose Your Seat screen with a short zoom-and-fade exit. */
  const goTo = (id: number) => {
    setLeaving(true);
    setTimeout(() => router.push(roomUrl(id)), 380);
  };

  const enter = (lobby: LobbyDetail) => {
    window.dispatchEvent(new Event('pusoy:wallet'));
    goTo(lobby.id);
  };

  // Join opens the confirmation (bet, requirements, Keys fee, password); Confirm Join sends it.
  const join = (lobby: LobbySummary) => {
    if (lobby.is_mine) {
      goTo(lobby.id);
      return;
    }
    setJoinFor(lobby);
  };

  const confirmJoin = async (lobby: LobbySummary, password?: string) => {
    try {
      // No bet is sent: bets are chosen in the game, each round, from the lobby's entry tier.
      const r = await api<{ data: LobbyDetail }>(`/lobbies/${lobby.id}/join`, { method: 'POST', body: password ? { password } : {} });
      play('chip');
      setJoinFor(null);
      enter(r.data);
    } catch (e) {
      play('lose');
      load();
      throw e;
    }
  };

  const quickJoin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ data: LobbyDetail }>('/lobbies/quick-join', { method: 'POST' });
      play('chip');
      enter(r.data);
    } catch (e) {
      play('lose');
      say(false, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Leave Multiplayer Lobby → Home. If you sit in a lobby that has not started, it asks first (others
   * are told live; ownership passes on, or the lobby closes when you were the last). A match in
   * progress is never abandoned from here: you go Home and can return to it.
   */
  const leaveLobby = async () => {
    if (busy) return;
    play('tap');
    if (!myLobby) {
      router.push('/home/');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ data: LobbyDetail }>(`/lobbies/${myLobby}`);
      if (r.data.is_seated && r.data.table_id && r.data.table_status !== 'IN_GAME') {
        setLeaveAsk(r.data);
      } else {
        router.push('/home/');
      }
    } catch {
      router.push('/home/');
    } finally {
      setBusy(false);
    }
  };

  const confirmLeave = async (lobby: LobbyDetail) => {
    if (busy || !lobby.table_id) return;
    setBusy(true);
    try {
      await api(`/tables/${lobby.table_id}/leave`, { method: 'POST' });
      window.dispatchEvent(new Event('pusoy:wallet'));
      setLeaveAsk(null);
      router.push('/home/');
    } catch (e) {
      play('lose');
      say(false, errorText(e));
      setLeaveAsk(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  const counts = list?.meta.counts ?? { all: 0, public: 0, private: 0 };
  const pages = list?.meta.pages ?? 1;
  const rows = list?.data ?? [];
  const name = user ? (user.display_name ?? user.name) : '';
  const myLobby = list?.meta.my_lobby_id ?? null;
  const otherTable = list?.meta.other_table_id ?? null;

  return (
    <Screen title="Multiplayer" immersive>
      <LandscapeStage background={<LanternRoom className="h-full w-full" />}>
        {/* Cinematic hand-off: the lobby zooms and fades out as you go to a table. */}
        <div className={`absolute inset-0 ${leaving ? 'cs-exit' : ''}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a0420]/30 via-transparent to-[#1a0420]/50" />

        {/* ---- top bar ---- */}
        <div className="absolute left-[20px] top-[14px] z-10 flex items-center gap-4">
          <button type="button" aria-label="Change avatar" onClick={() => setPanel('avatar')} className="lx-tile lx-gold relative rounded-full p-[5px] shadow-[0_6px_0_#7a3e00]">
            <span className="block overflow-hidden rounded-full border-2 border-white/70">
              <Avatar name={name} avatar={user?.avatar} userId={user?.id} size={110} rim={false} />
            </span>
            <span className="absolute -bottom-1 -right-1 flex h-[38px] w-[38px] items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-b from-[#ffd34d] to-[#e08a00] text-[18px] text-[#4a1d00]" aria-hidden="true">
              ✎
            </span>
          </button>
          <div className="leading-tight">
            <p className="max-w-[300px] truncate font-display text-[36px] font-black text-white drop-shadow-[0_3px_0_rgb(0_0_0/0.6)]">{name}</p>
            <p className="font-display text-[24px] font-black text-[#ffe14d]">ID: {user?.id ?? '…'}</p>
            {user?.level && <span className="mt-1 inline-block rounded-full border-2 border-[#9cf08a] bg-gradient-to-b from-[#3fd04f] to-[#138a24] px-3 font-display text-[20px] font-black text-white">Lv. {user.level.level}</span>}
          </div>
        </div>

        <div className="lx-gold absolute left-[560px] top-[22px] z-10 h-[78px] w-[480px] rounded-full p-[5px] shadow-[0_6px_0_#7a3e00]">
          <div className="flex h-full items-center gap-3 rounded-full bg-gradient-to-b from-[#5a0609] to-[#2a0204] pl-4 pr-2">
            <ChipMark size={56} />
            {/* Display only: no (+), no tap action. */}
            <span className="flex-1 cursor-default select-none pr-[58px] text-center font-display text-[38px] font-black text-white" aria-label="Chips balance">
              {balance !== undefined ? fmtChips(Math.floor(balance)) : '…'}
            </span>
          </div>
        </div>

        {/* Keys wallet, beside Chips. Display only, like Chips (Keys are bought in the Shop). */}
        <div className="lx-gold absolute left-[1060px] top-[22px] z-10 h-[78px] w-[290px] rounded-full p-[5px] shadow-[0_6px_0_#7a3e00]" role="group" aria-label={`Keys wallet: ${keyCount !== undefined ? Math.floor(keyCount) : '…'}`}>
          <div className="flex h-full items-center gap-3 rounded-full bg-gradient-to-b from-[#5a1a9a] to-[#24074a] pl-4 pr-2">
            <KeyIcon size={52} />
            <span className="flex-1 cursor-default select-none pr-[20px] text-center font-display text-[38px] font-black text-white" aria-label="Keys balance">
              {keyCount !== undefined ? fmtChips(Math.floor(keyCount)) : '…'}
            </span>
          </div>
        </div>

        <div className="absolute right-[24px] top-[14px] z-10 flex gap-4">
          <TopIcon label={soundOn ? 'Sound on — tap to turn off' : 'Sound off — tap to turn on'} onClick={() => savePrefs({ sfx: !soundOn })}>
            <svg viewBox="0 0 40 40" className="h-[46px] w-[46px]" aria-hidden="true">
              <path d="M5 15 H12 L22 6 V34 L12 25 H5Z" fill="#ffd34d" />
              {soundOn ? <path d="M27 14 Q31 20 27 26 M31 10 Q38 20 31 30" stroke="#ffd34d" strokeWidth="3.2" fill="none" strokeLinecap="round" /> : <path d="M27 14 L37 26 M37 14 L27 26" stroke="#ff6b6b" strokeWidth="3.4" strokeLinecap="round" />}
            </svg>
          </TopIcon>
          <TopIcon label="Settings" onClick={() => setPanel('settings')}>
            <svg viewBox="0 0 40 40" className="h-[50px] w-[50px]" aria-hidden="true">
              <g fill="#ffd34d" stroke="#8a4a00" strokeWidth="1">
                {Array.from({ length: 8 }, (_, i) => (
                  <rect key={i} x="16.5" y="2" width="7" height="9" rx="2" transform={`rotate(${i * 45} 20 20)`} />
                ))}
                <circle cx="20" cy="20" r="12" />
              </g>
              <circle cx="20" cy="20" r="5" fill="#7a0a0e" />
            </svg>
          </TopIcon>
        </div>

        {/* ---- left sidebar ---- */}
        {/* Leave Multiplayer Lobby: back to Home (leaving a lobby you sit in first, after confirming). */}
        <button
          type="button"
          onClick={leaveLobby}
          disabled={busy}
          className="lx-tile absolute left-[18px] top-[146px] z-10 flex h-[70px] items-center gap-3 rounded-full border-[4px] border-[#ffc531] bg-gradient-to-b from-[#8a1a1f] to-[#3a0406] pl-2 pr-5 text-white shadow-[0_5px_0_#1a0204] disabled:opacity-60"
        >
          <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#ffd34d] to-[#e08a00] shadow-[inset_0_2px_0_rgb(255_255_255/0.5)]">
            {/* door with an arrow going out */}
            <svg viewBox="0 0 40 40" className="h-[38px] w-[38px]" aria-hidden="true">
              <path d="M8 5 H22 V35 H8Z" fill="#7a3e00" stroke="#4a1d00" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M8 5 L19 8 V37 L8 35Z" fill="#b5651d" stroke="#4a1d00" strokeWidth="1.4" strokeLinejoin="round" />
              <circle cx="16.5" cy="21" r="1.4" fill="#ffe14d" />
              <path d="M24 20 H37 M31 14 L37 20 L31 26" fill="none" stroke="#4a1d00" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-[22px] font-black leading-none drop-shadow-[0_2px_0_rgb(0_0_0/0.6)]">Leave Multiplayer Lobby</span>
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#ffe14d]" aria-hidden="true">
            <path d="M5 12 H18 M13 7 L18 12 L13 17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <nav className="lx-gold absolute left-[18px] top-[230px] z-10 w-[150px] rounded-[30px] p-[5px] shadow-[0_6px_0_#5a2a00]" aria-label="Lobby menu">
          <div className="flex flex-col divide-y divide-[#ffc531]/30 rounded-[25px] bg-gradient-to-b from-[#6a1220] to-[#2e0408] py-1">
            <SideItem label="Friends" onClick={() => setPanel('friends')}>
              <People size={50} color="#ffb36b" />
            </SideItem>
            <SideItem
              label="Shop"
              onClick={() => {
                play('tap');
                setPanel('shop');
              }}
            >
              {/* store front with an awning */}
              <svg viewBox="0 0 40 40" className="h-[60px] w-[60px]" aria-hidden="true">
                <path d="M7 17 V35 H33 V17" fill="#fff3d6" stroke="#8a4a00" strokeWidth="1.5" />
                <rect x="16" y="24" width="8" height="11" rx="1" fill="#b5651d" stroke="#8a4a00" strokeWidth="1" />
                <path d="M4 10 L8 4 H32 L36 10Z" fill="#ffd34d" stroke="#8a4a00" strokeWidth="1.5" strokeLinejoin="round" />
                {[0, 1, 2, 3].map((i) => (
                  <path key={i} d={`M${4 + i * 8} 10 H${12 + i * 8} V14 Q${8 + i * 8} 19 ${4 + i * 8} 14Z`} fill={i % 2 ? '#ffffff' : '#e0262f'} stroke="#8a4a00" strokeWidth="1" />
                ))}
                <circle cx="27" cy="27" r="3" fill="#ffd34d" stroke="#8a4a00" strokeWidth="1" />
              </svg>
            </SideItem>
          </div>
        </nav>

        {/* ---- crest + main buttons ---- */}
        <div className="absolute left-[600px] top-[112px] z-[5]">
          <LobbyCrest />
        </div>
        <CandyButton tone="gold" onClick={quickJoin} disabled={busy || !user} className="absolute left-[250px] top-[262px] z-10 h-[100px] w-[360px] text-[48px]">
          <svg viewBox="0 0 24 24" className="h-[50px] w-[40px]" aria-hidden="true">
            <path d="M14 2 L4 14 H11 L9 22 L20 9 H13Z" fill="#fff3a0" stroke="#7a3e00" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span className="drop-shadow-[0_2px_0_rgb(255_255_255/0.4)]">Quick Join</span>
        </CandyButton>
        <CandyButton tone="purple" onClick={() => setPanel('create')} disabled={!user} className="absolute left-[1040px] top-[262px] z-10 h-[100px] w-[380px] text-[48px]">
          <span className="drop-shadow-[0_3px_0_#2a0660]">Create Lobby</span>
        </CandyButton>

        {/* ---- tabs + search ---- */}
        <div className="absolute left-[200px] top-[384px] z-10 flex items-center gap-4" role="tablist" aria-label="Lobby categories">
          {(
            [
              ['all', `All (${counts.all})`],
              ['public', `Public Lobby (${counts.public})`],
              ['private', `Private Lobby (${counts.private})`],
            ] as Array<[LobbyTab, string]>
          ).map(([t, text]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                play('tap');
                setTab(t);
                setPage(1);
              }}
              className={`lx-tile flex h-[62px] items-center gap-2 rounded-[18px] border-[4px] px-6 font-display text-[26px] font-black ${tab === t ? 'border-[#fff3a0] bg-gradient-to-b from-[#ffe46a] to-[#e08a00] text-[#4a1d00] shadow-[0_5px_0_#8a4a00]' : 'border-[#d9a441] bg-gradient-to-b from-[#6a1218] to-[#33060a] text-[#ffe9b0] shadow-[0_5px_0_#1a0204]'}`}
            >
              {t === 'private' ? <Lock size={26} /> : t === 'public' ? <People size={24} color={tab === t ? '#4a1d00' : '#ffe9b0'} /> : <span aria-hidden="true">▦</span>}
              {text}
            </button>
          ))}
        </div>
        <div className="absolute left-[1080px] top-[384px] z-10 flex items-center gap-3">
          <div className="relative">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-7 w-7 -translate-y-1/2" aria-hidden="true">
              <circle cx="10" cy="10" r="7" stroke="#ffe9b0" strokeWidth="2.6" fill="none" />
              <path d="M15 15 L21 21" stroke="#ffe9b0" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            <input aria-label="Search lobby ID or name" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lobby ID or name…" className="h-[62px] w-[380px] rounded-full border-[4px] border-[#d9a441] bg-[#1d0306]/90 pl-14 pr-5 text-[22px] font-bold text-white outline-none placeholder:text-white/45 focus:border-[#ffe14d]" />
          </div>
          <button
            type="button"
            aria-label="Refresh"
            onClick={() => {
              play('tap');
              setLoading(true);
              load();
            }}
            className="lx-tile flex h-[62px] w-[62px] items-center justify-center rounded-full border-[4px] border-[#ffc531] bg-gradient-to-b from-[#8a1a1f] to-[#3a0406]"
          >
            <svg viewBox="0 0 40 40" className={`h-8 w-8 ${loading ? 'animate-spin' : ''}`} aria-hidden="true">
              <path d="M31 15 A12 12 0 0 0 9 13 M9 25 A12 12 0 0 0 31 27" stroke="#ffd34d" strokeWidth="4.5" fill="none" strokeLinecap="round" />
              <path d="M31 6 V15 H22 M9 34 V25 H18" stroke="#ffd34d" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* ---- lobby table ---- */}
        <div className="lx-gold absolute left-[190px] top-[462px] z-10 h-[338px] w-[1390px] rounded-[34px] p-[6px] shadow-[0_8px_0_#5a2a00]">
          <div className="h-full rounded-[28px] bg-gradient-to-b from-[#5a0c18]/95 to-[#2a0410]/95 px-4 py-2">
            <div className="grid grid-cols-[2.6fr_1.5fr_1.1fr_1.25fr_0.8fr_0.95fr_1.15fr_1.25fr] items-center border-b-2 border-[#ffc531]/40 pb-1 text-center font-display text-[22px] font-black text-[#ffe9b0]">
              <span className="text-left pl-4">Lobby Name</span>
              <span>Game Type</span>
              <span>Bet</span>
              <span>Min. Entry</span>
              <span>Prep</span>
              <span>Players</span>
              <span>Mode</span>
              <span>Status</span>
            </div>
            {loading && !list ? (
              <p className="py-20 text-center font-display text-[30px] font-black text-white/80" role="status">
                Loading lobbies…
              </p>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12 text-center" role="status">
                <p className="font-display text-[30px] font-black text-white">{query ? `No lobby matches “${query}”.` : 'No open lobbies yet.'}</p>
                <CandyButton tone="purple" onClick={() => setPanel('create')} className="h-[70px] w-[340px] text-[30px]">
                  Create one!
                </CandyButton>
              </div>
            ) : (
              <ul aria-label="Lobbies">
                {rows.map((l) => (
                  <li key={l.id} className="grid h-[56px] grid-cols-[2.6fr_1.5fr_1.1fr_1.25fr_0.8fr_0.95fr_1.15fr_1.25fr] items-center border-b border-white/10 text-center font-display text-[24px] font-black text-white last:border-0" aria-label={`${l.name}, ${l.players} of 4 players`}>
                    <span className="flex items-center gap-3 pl-3 text-left">
                      <svg viewBox="0 0 40 30" className="h-[30px] w-[40px] shrink-0" aria-hidden="true">
                        <path d="M3 26 L1 6 L12 15 L20 2 L28 15 L39 6 L37 26Z" fill="#ffd34d" stroke="#8a4a00" strokeWidth="1.6" strokeLinejoin="round" />
                      </svg>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate">{l.name}</span>
                        <span className="block text-[16px] text-[#ffe9b0]/80">
                          ID {l.lobby_id}
                        </span>
                      </span>
                    </span>
                    {/* The game mode the creator chose (server label: Round Bank / Banker Mode). */}
                    <span aria-label="Game Type" className={`mx-auto whitespace-nowrap rounded-full border-[3px] px-3 py-0.5 text-[19px] ${l.game_mode === 'banker' ? 'border-[#ffc531] bg-gradient-to-b from-[#8a5a0a] to-[#3a2402] text-[#ffe14d]' : 'border-[#ff8a9a] bg-gradient-to-b from-[#a3122a] to-[#4a0612] text-white'}`}>
                      {l.game_mode_label}
                    </span>
                    {/* The lobby's three bets (e.g. 20/30/40). */}
                    <span className="flex items-center justify-center gap-1" aria-label="Bets">
                      <ChipMark size={28} />
                      {(l.bet_chips ?? [l.min_bet]).map(fmtChips).join('/')}
                    </span>
                    {/* Minimum Entry and the Keys fee paid when the game starts. */}
                    <span className="flex flex-col items-center justify-center leading-tight">
                      <span className="flex items-center gap-1">
                        <ChipMark size={28} />
                        {fmtChips(l.min_entry)}
                      </span>
                      {l.key_fee > 0 && <span className="text-[16px] text-[#ffe14d]">{keysLabel(l.key_fee)}</span>}
                    </span>
                    <span>{l.preparation_seconds}s</span>
                    <span className="flex items-center justify-center gap-2">
                      <People size={22} />
                      {l.players}/{l.max_players}
                    </span>
                    <span>
                      <TypeBadge type={l.type} className="text-[19px]" />
                    </span>
                    <span className="flex justify-center">
                      <StatusCell lobby={l} busy={busy} onJoin={() => join(l)} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ---- pagination (only with more than one page) ---- */}
        {pages > 1 && (
          <nav className="absolute left-[540px] top-[816px] z-10 flex items-center gap-4" aria-label="Pages">
            {(
              [
                ['«', 'First page', 1],
                ['‹', 'Previous page', page - 1],
              ] as Array<[string, string, number]>
            ).map(([t, label, p]) => (
              <button key={label} type="button" aria-label={label} disabled={page <= 1} onClick={() => setPage(p)} className="lx-tile h-[62px] w-[86px] rounded-full border-[4px] border-[#d9a441] bg-gradient-to-b from-[#6a1218] to-[#33060a] font-display text-[34px] font-black text-[#ffe9b0] disabled:opacity-40">
                {t}
              </button>
            ))}
            <span className="flex h-[62px] items-center rounded-full border-[4px] border-[#d9a441] bg-[#1d0306] px-8 font-display text-[28px] font-black text-white" aria-live="polite">
              Page <span className="mx-2 text-[#ffe14d]">{page}</span> of {pages}
            </span>
            {(
              [
                ['›', 'Next page', page + 1],
                ['»', 'Last page', pages],
              ] as Array<[string, string, number]>
            ).map(([t, label, p]) => (
              <button key={label} type="button" aria-label={label} disabled={page >= pages} onClick={() => setPage(p)} className="lx-tile h-[62px] w-[86px] rounded-full border-[4px] border-[#ffc2c2] bg-gradient-to-b from-[#ff6b5c] to-[#b3121a] font-display text-[34px] font-black text-white disabled:opacity-40">
                {t}
              </button>
            ))}
          </nav>
        )}

        {/* You are already in a lobby that is not on this page — or seated at another table, which
            blocks joining a lobby until you leave it: a way back either way. */}
        {myLobby && !rows.some((r) => r.id === myLobby) && (
          <button type="button" onClick={() => goTo(myLobby)} className="absolute bottom-[24px] left-[24px] z-20 rounded-full border-4 border-[#4ee36b] bg-[#0f2a1c]/95 px-6 py-2 font-display text-[22px] font-black text-white">
            You are in a lobby — tap to return
          </button>
        )}
        {otherTable && (
          <button type="button" onClick={() => router.push(`/play/?table=${otherTable}`)} className="absolute bottom-[24px] left-[24px] z-20 max-w-[480px] rounded-[22px] border-4 border-[#ffd34d] bg-[#3a2a02]/95 px-5 py-2 text-left font-display text-[20px] font-black leading-tight text-white">
            You have a seat at another table — tap to go there (leave it to join a lobby)
          </button>
        )}

        {/* ---- popups ---- */}
        {panel === 'create' && <CreateLobbyModal balance={balance} keys={keyCount} tiers={list?.meta.tiers} onClose={() => setPanel(null)} onCreated={enter} />}
        {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
        {panel === 'shop' && <ShopModal onClose={() => setPanel(null)} />}
        {leaveAsk && <LeaveLobbyConfirm lobby={leaveAsk} busy={busy} onCancel={() => setLeaveAsk(null)} onLeave={() => confirmLeave(leaveAsk)} />}
        {panel === 'avatar' && <AvatarPicker onClose={() => setPanel(null)} />}
        {panel === 'friends' && (
          <Modal title="Friends" onClose={() => setPanel(null)} width={620}>
            <div className="h-[560px]">
              <FriendsPanel enabled={!!user} />
            </div>
          </Modal>
        )}
        {joinFor && <JoinLobbyModal lobby={joinFor} chips={balance} keys={keyCount} onClose={() => setJoinFor(null)} onJoin={(pw) => confirmJoin(joinFor, pw)} />}

        {toast && (
          <div role="alert" className={`absolute left-1/2 top-[150px] z-[60] -translate-x-1/2 whitespace-nowrap rounded-full border-4 px-8 py-3 font-display text-[26px] font-black shadow-lg ${toast.ok ? 'border-[#4ee36b] bg-[#0f2a1c] text-[#b9ffcb]' : 'border-[#ff8a8a] bg-[#3a0d14] text-[#ffe4e4]'}`}>
            {toast.text}
          </div>
        )}
        </div>
      </LandscapeStage>
    </Screen>
  );
}

/** Leaving the Multiplayer Lobby while seated in a lobby: what happens to it, then Leave or Stay. */
function LeaveLobbyConfirm({ lobby, busy, onCancel, onLeave }: { lobby: LobbyDetail; busy: boolean; onCancel: () => void; onLeave: () => void }) {
  const others = lobby.seats.filter((x) => x.user_id && !x.is_you).length;
  const effect = others === 0 ? 'You are the only player, so the lobby will close.' : lobby.is_owner ? `Ownership passes to the next player, and the other ${others === 1 ? 'player is' : `${others} players are`} told right away.` : `The other ${others === 1 ? 'player is' : `${others} players are`} told right away.`;
  return (
    <Modal title="Leave Lobby?" onClose={onCancel} width={760}>
      <p className="text-center font-display text-[28px] font-black text-[#ffe9b0]">
        {lobby.name} <span className="text-white/60">· ID {lobby.lobby_id}</span>
      </p>
      <p className="mt-3 text-center text-[24px] font-bold text-white/85">Leaving the Multiplayer Lobby also removes you from this lobby. {effect}</p>
      <div className="mt-7 flex justify-center gap-6">
        <CandyButton tone="dark" onClick={onCancel} className="h-[78px] w-[240px] text-[30px]">
          Stay
        </CandyButton>
        <CandyButton tone="gold" onClick={onLeave} disabled={busy} className="h-[78px] w-[300px] text-[30px]">
          {busy ? 'Leaving…' : 'Leave Lobby'}
        </CandyButton>
      </div>
    </Modal>
  );
}

/**
 * Join confirmation: the lobby's Minimum Entry, its in-game bets (chosen in the game, each round),
 * the Keys fee and when it is deducted, against your Chips and Keys — and, for a private lobby, the
 * password. Confirm Join stays disabled while you do not meet the requirements. The server
 * checks everything again.
 */
function JoinLobbyModal({ lobby, chips, keys, onClose, onJoin }: { lobby: LobbySummary; chips?: number; keys?: number; onClose: () => void; onJoin: (password?: string) => Promise<void> }) {
  const bets = (lobby.bet_chips ?? [lobby.min_bet]).map(Number);
  const [pw, setPw] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isPrivate = lobby.type === 'private';
  // To join you need the Minimum Entry and the Keys fee (bets are chosen later, in the game).
  const problem = entryProblem({ min_entry: lobby.min_entry, bets, keys: lobby.key_fee ?? 0 }, Math.min(...bets), chips, keys);

  const submit = async () => {
    if (busy) return;
    if (problem) {
      setError(problem);
      return;
    }
    if (isPrivate && !pw) {
      setError('Enter the lobby password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onJoin(isPrivate ? pw : undefined);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Join Lobby" onClose={onClose} width={760}>
      <p className="mb-4 text-center font-display text-[28px] font-black text-[#ffe9b0]">
        {lobby.name} <span className="text-white/60">· ID {lobby.lobby_id} · Round Bank</span>
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <EntryTerms minEntry={lobby.min_entry} bets={bets} keyFee={lobby.key_fee ?? 0} chips={chips} keys={keys} />
        {isPrivate && (
          <div className="relative mt-4">
            <input aria-label="Lobby password" type={shown ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Enter password" className={`${inputClass} pr-16`} />
            <EyeButton shown={shown} onToggle={() => setShown((v) => !v)} label="password" />
          </div>
        )}
        {(error || problem) && (
          <p role="alert" className="mt-3 text-center text-[22px] font-bold text-[#ff9aa8]">
            {error ?? problem}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-6">
          <CandyButton tone="dark" onClick={onClose} className="h-[78px] w-[240px] text-[30px]">
            Cancel
          </CandyButton>
          <CandyButton tone="gold" type="submit" disabled={busy || !!problem} className="h-[78px] w-[340px] text-[30px]">
            {busy ? 'Joining…' : '▶ Confirm Join'}
          </CandyButton>
        </div>
      </form>
    </Modal>
  );
}
