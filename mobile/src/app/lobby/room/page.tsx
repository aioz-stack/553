'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import LandscapeStage from '@/components/LandscapeStage';
import CreateLobbyModal from '@/components/lobby/CreateLobbyModal';
import { CandyButton, EyeButton, Gem, Modal, TypeBadge, inputClass } from '@/components/lobby/LobbyUI';
import { Face, LanternRoom, PokerTable, type FaceKind } from '@/components/table/TableArt';
import { Screen } from '@/components/ui';
import { api, ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQueryParam } from '@/lib/hooks';
import { MODE_RULE, fmtDiamonds, useWaitingRoomUpdates, type LobbyDetail, type LobbySeat } from '@/lib/lobby';
import { play } from '@/lib/sound';
import { useLandscapeLock } from '@/lib/useLandscapeLock';

/**
 * Multiplayer Waiting Room (1600×900 stage): the lobby's details and its four seats (avatar,
 * name, Ready, Owner crown, Banker badge, online state). Players toggle Ready; the owner can edit
 * the lobby, remove a player, and Start once all four are seated and the others are ready. Live
 * over the table's presence channel (plus a 3 s poll and a heartbeat). When the game starts,
 * everyone moves to the game table (/play). The server decides everything (LobbyService).
 */

const FACES: FaceKind[] = ['cap', 'spiky', 'shades', 'beard'];
// Seats around the table (stage coordinates): you sit wherever the server placed you.
const SPOTS = [
  { x: 640, y: 560 },
  { x: 200, y: 300 },
  { x: 640, y: 120 },
  { x: 1080, y: 300 },
];

function SeatCard({ seat, canKick, onKick }: { seat: LobbySeat; canKick: boolean; onKick: () => void }) {
  if (!seat.user_id) {
    return (
      <div className="flex h-[230px] w-[320px] flex-col items-center justify-center rounded-[28px] border-[5px] border-dashed border-[#ffc531]/60 bg-black/35 text-center" aria-label={`Seat ${seat.seat}: empty`}>
        <span className="flex h-[96px] w-[96px] items-center justify-center rounded-full border-4 border-dashed border-white/40 font-display text-[56px] font-black text-white/50">?</span>
        <span className="mt-3 font-display text-[24px] font-black text-white/70">Waiting for player…</span>
      </div>
    );
  }
  return (
    <div
      className={`relative flex h-[230px] w-[320px] flex-col items-center rounded-[28px] p-[6px] ${seat.is_banker ? 'bg-gradient-to-b from-[#9fe0ff] to-[#1f6fe0] shadow-[0_0_26px_rgb(80_180_255/0.8),0_7px_0_#0c3a8a]' : 'lx-gold shadow-[0_7px_0_#7a3e00]'}`}
      aria-label={`Seat ${seat.seat}: ${seat.name}${seat.is_you ? ' (you)' : ''}${seat.is_owner ? ', owner' : ''}${seat.is_banker ? ', banker' : ''}, ${seat.is_ready ? 'ready' : 'not ready'}`}
    >
      <div className="flex h-full w-full flex-col items-center rounded-[23px] bg-gradient-to-b from-[#7a0f16] to-[#2e0306] px-3 pt-3">
        {seat.is_owner && (
          <span className="absolute -top-[26px] left-1/2 -translate-x-1/2" title="Lobby owner">
            <svg viewBox="0 0 40 30" className="h-[40px] w-[54px]" aria-hidden="true">
              <path d="M3 26 L1 6 L12 15 L20 2 L28 15 L39 6 L37 26Z" fill="#ffd34d" stroke="#8a4a00" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        <div className="relative">
          <div className={`overflow-hidden rounded-full border-[4px] ${seat.is_connected === false ? 'border-white/30 grayscale' : 'border-white'}`}>
            <Face kind={FACES[(seat.seat - 1) % 4]} size={96} />
          </div>
          {seat.is_connected === false && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-2 text-[14px] font-bold text-white">offline</span>}
        </div>
        <span className="mt-2 max-w-full truncate font-display text-[26px] font-black text-white">
          {seat.name}
          {seat.is_you && <span className="text-[#ffe14d]"> (you)</span>}
        </span>
        <div className="mt-1 flex items-center gap-2">
          {seat.is_banker && <span className="rounded-full border-2 border-white bg-gradient-to-b from-[#ffd34d] to-[#e08a00] px-3 font-display text-[16px] font-black text-[#4a1d00]">BANKER</span>}
          {seat.is_owner ? (
            <span className="rounded-full bg-black/40 px-3 font-display text-[17px] font-black text-[#ffe14d]">Owner</span>
          ) : (
            <span className={`rounded-full px-3 font-display text-[18px] font-black ${seat.is_ready ? 'bg-[#13a344] text-white' : 'bg-black/45 text-white/75'}`}>{seat.is_ready ? 'Ready ✓' : 'Not ready'}</span>
          )}
        </div>
        {canKick && (
          <button type="button" onClick={onKick} aria-label={`Remove ${seat.name}`} className="absolute right-3 top-3 rounded-full border-2 border-white/50 bg-black/40 px-2 text-[15px] font-bold text-white/85">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export default function WaitingRoom() {
  const { user } = useAuth();
  const router = useRouter();
  const idParam = useQueryParam('id');
  const roomId = idParam ? Number(idParam) : null;
  useLandscapeLock();

  const [lobby, setLobby] = useState<LobbyDetail | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [askPw, setAskPw] = useState(false);
  const wasSeated = useRef(false);

  const say = useCallback((ok: boolean, text: string) => setToast({ ok, text }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    if (!user || !roomId) return;
    try {
      const r = await api<{ data: LobbyDetail }>(`/lobbies/${roomId}`);
      setLobby(r.data);
      if (r.data.is_seated) wasSeated.current = true;
      else if (wasSeated.current) {
        wasSeated.current = false;
        say(false, 'You are no longer in this lobby.');
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone('This lobby no longer exists.');
      else say(false, errorText(e));
    }
  }, [user, roomId, say]);

  useEffect(() => {
    load();
  }, [load]);

  const tableId = lobby?.is_seated ? lobby.table_id : null;
  useWaitingRoomUpdates(tableId, load, () => {
    if (tableId) api(`/tables/${tableId}/heartbeat`, { method: 'POST' }).catch(() => undefined);
  });

  // The game started: everyone seated goes to the game table.
  useEffect(() => {
    if (lobby?.is_seated && lobby.table_status === 'IN_GAME' && lobby.table_id) {
      play('start');
      router.replace(`/play/?table=${lobby.table_id}`);
    }
  }, [lobby?.is_seated, lobby?.table_status, lobby?.table_id, router]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (ok) say(true, ok);
      await load();
    } catch (e) {
      play('lose');
      say(false, errorText(e));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const me = lobby?.seats.find((s) => s.is_you);
  const closed = lobby?.status === 'closed' || !!gone;

  const leave = () =>
    act(async () => {
      if (lobby?.table_id && lobby.is_seated) await api(`/tables/${lobby.table_id}/leave`, { method: 'POST' });
      wasSeated.current = false;
      router.replace('/lobby/');
    });

  const joinHere = async (password?: string) => {
    if (!lobby) return;
    if (lobby.type === 'private' && password === undefined) {
      setAskPw(true);
      return;
    }
    await act(async () => {
      await api(`/lobbies/${lobby.id}/join`, { method: 'POST', body: password ? { password } : {} });
      setAskPw(false);
      window.dispatchEvent(new Event('pusoy:wallet'));
    });
  };

  return (
    <Screen title="Waiting Room" immersive>
      <LandscapeStage background={<LanternRoom className="h-full w-full" />}>
        <PokerTable />

        {/* header */}
        <button
          type="button"
          onClick={() => (lobby?.is_seated ? leave() : router.replace('/lobby/'))}
          aria-label={lobby?.is_seated ? 'Leave lobby' : 'Back to lobby'}
          className="lx-tile absolute left-[24px] top-[22px] z-20 flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-[#ffc531] bg-gradient-to-b from-[#8a1a1f] to-[#3a0406] text-white shadow-[0_6px_0_#1a0204]"
        >
          <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
            <path d="M24 9 L12 20 L24 31 M12 20 H32" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {lobby && (
          <div className="lx-gold absolute left-[120px] top-[16px] z-20 w-[1360px] rounded-[30px] p-[5px] shadow-[0_6px_0_#5a2a00]">
            <div className="flex h-[88px] items-center gap-5 rounded-[25px] bg-gradient-to-b from-[#6a1220] to-[#2e0408] px-6">
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-[36px] font-black leading-tight text-white">{lobby.name}</h1>
                <p className="font-display text-[20px] font-black text-[#ffe9b0]">
                  Lobby ID <span className="text-[#ffe14d]">{lobby.lobby_id}</span> · Owner {lobby.owner ?? '—'}
                </p>
              </div>
              <span className="rounded-full bg-black/40 px-4 py-1 font-display text-[22px] font-black text-white">{lobby.game_mode_label}</span>
              <span className="flex items-center gap-1 rounded-full bg-black/40 px-4 py-1 font-display text-[22px] font-black text-white" title="Minimum Entry">
                <Gem size={30} /> {fmtDiamonds(lobby.min_entry)}
              </span>
              <span className="rounded-full bg-black/40 px-4 py-1 font-display text-[22px] font-black text-white" title="Preparation Time">
                ⏱ {lobby.preparation_seconds}s
              </span>
              <TypeBadge type={lobby.type} className="text-[20px]" />
              {lobby.is_owner && lobby.table_status !== 'IN_GAME' && !closed && (
                <CandyButton tone="dark" onClick={() => setEdit(true)} className="h-[56px] px-5 text-[22px]" label="Lobby settings">
                  ⚙ Edit
                </CandyButton>
              )}
            </div>
          </div>
        )}

        {/* seats */}
        {lobby &&
          lobby.seats.map((s, i) => (
            <div key={s.seat} className="absolute z-10" style={{ left: SPOTS[i].x, top: SPOTS[i].y }}>
              <SeatCard seat={s} canKick={lobby.is_owner && !s.is_you && !!s.user_id && lobby.table_status !== 'IN_GAME'} onKick={() => act(() => api(`/lobbies/${lobby.id}/kick`, { method: 'POST', body: { user_id: s.user_id } }), `${s.name} was removed.`)} />
            </div>
          ))}

        {/* centre: rules + status */}
        {lobby && (
          <div className="absolute left-[520px] top-[372px] z-10 flex w-[560px] flex-col items-center text-center">
            <p className="font-display text-[22px] font-black text-[#ffe9b0]">{MODE_RULE[lobby.game_mode]}</p>
            <p className="mt-1 font-display text-[18px] font-bold text-white/75">
              Bet {fmtDiamonds(lobby.min_bet)} diamonds+ per round · bets are held and settled by the server
            </p>
            <p className="mt-3 rounded-full bg-black/50 px-6 py-2 font-display text-[26px] font-black text-white" role="status">
              {gone ?? lobby.start_hint}
            </p>
          </div>
        )}

        {/* actions */}
        {lobby && !closed && (
          <div className="absolute bottom-[30px] right-[40px] z-20 flex flex-col items-end gap-4">
            {lobby.is_seated && lobby.is_owner && (
              <CandyButton tone="green" disabled={!lobby.can_start || busy} onClick={() => act(() => api(`/lobbies/${lobby.id}/start`, { method: 'POST' }))} className="h-[96px] w-[330px] text-[40px]">
                ▶ Start Game
              </CandyButton>
            )}
            {lobby.is_seated && !lobby.is_owner && me && (
              <CandyButton tone={me.is_ready ? 'dark' : 'gold'} disabled={busy} onClick={() => act(() => api(`/tables/${lobby.table_id}/ready`, { method: 'POST', body: { ready: !me.is_ready } }))} className="h-[96px] w-[330px] text-[40px]">
                {me.is_ready ? 'Not Ready' : '✓ Ready'}
              </CandyButton>
            )}
            {!lobby.is_seated && lobby.can_join && (
              <CandyButton tone="gold" disabled={busy} onClick={() => joinHere()} className="h-[96px] w-[330px] text-[40px]">
                ▶ Join
              </CandyButton>
            )}
            {lobby.is_seated && (
              <CandyButton tone="red" disabled={busy} onClick={leave} className="h-[70px] w-[240px] text-[30px]">
                Leave
              </CandyButton>
            )}
          </div>
        )}

        {!lobby && !gone && (
          <p className="absolute left-0 right-0 top-[420px] z-10 text-center font-display text-[36px] font-black text-white" role="status">
            Opening the lobby…
          </p>
        )}
        {(closed || (gone && !lobby)) && (
          <div className="absolute left-1/2 top-[700px] z-20 -translate-x-1/2">
            <CandyButton tone="gold" onClick={() => router.replace('/lobby/')} className="h-[86px] w-[380px] text-[34px]">
              Back to Lobby
            </CandyButton>
          </div>
        )}

        {edit && lobby && (
          <CreateLobbyModal
            edit={lobby}
            onClose={() => setEdit(false)}
            onCreated={(l) => {
              setLobby(l);
              setEdit(false);
              say(true, 'Lobby updated.');
            }}
          />
        )}
        {askPw && lobby && <JoinPassword onClose={() => setAskPw(false)} onJoin={(pw) => joinHere(pw)} />}

        {toast && (
          <div role="alert" className={`absolute left-1/2 top-[130px] z-[60] -translate-x-1/2 whitespace-nowrap rounded-full border-4 px-8 py-3 font-display text-[26px] font-black shadow-lg ${toast.ok ? 'border-[#4ee36b] bg-[#0f2a1c] text-[#b9ffcb]' : 'border-[#ff8a8a] bg-[#3a0d14] text-[#ffe4e4]'}`}>
            {toast.text}
          </div>
        )}
      </LandscapeStage>
    </Screen>
  );
}

function JoinPassword({ onClose, onJoin }: { onClose: () => void; onJoin: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  const [shown, setShown] = useState(false);
  return (
    <Modal title="Private Lobby" onClose={onClose} width={720}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pw) onJoin(pw);
        }}
      >
        <div className="relative">
          <input aria-label="Lobby password" autoFocus type={shown ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Enter password" className={`${inputClass} pr-16`} />
          <EyeButton shown={shown} onToggle={() => setShown((s) => !s)} label="password" />
        </div>
        <div className="mt-6 flex justify-center">
          <CandyButton tone="gold" type="submit" disabled={!pw} className="h-[78px] w-[280px] text-[32px]">
            ▶ Join
          </CandyButton>
        </div>
      </form>
    </Modal>
  );
}
