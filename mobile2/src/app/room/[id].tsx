import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { walletChanged } from '@/lib/events';
import { fmtChips, useWaitingRoomUpdates, type LobbyDetail, type LobbySeat } from '@/lib/multiplayer';
import { Avatar, CandyButton, GameText, Squish, Toast } from '@/ui/kit';
import { Stage } from '@/ui/Stage';
import { Banner, PokerTable, SEAT, type Spot } from '@/ui/Table';
import { font } from '@/ui/theme';

const SPOT_OF: Record<number, Spot> = { 1: 'bottom', 2: 'left', 3: 'top', 4: 'right' };

/** Choose Your Seat: seats, your bet, Ready, and the synchronized countdown (server-run). */
export default function Room() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = Number(id);
  const [lobby, setLobby] = useState<LobbyDetail | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);

  const load = useCallback(async () => {
    if (!roomId) return;
    const sent = Date.now();
    try {
      const r = await api<{ data: LobbyDetail }>(`/lobbies/${roomId}`);
      offset.current = new Date(r.data.server_time).getTime() - (sent + Date.now()) / 2;
      setLobby(r.data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setToast({ ok: false, text: 'This lobby no longer exists.' });
        setTimeout(() => router.replace('/lobby'), 1500);
      }
    }
  }, [roomId]);
  useEffect(() => {
    void load();
  }, [load]);

  const counting = !!lobby?.countdown_ends_at;
  useWaitingRoomUpdates(lobby?.is_seated ? lobby.table_id : null, load, counting);

  // Countdown clock aligned to the server; one look right as it ends (the server starts the match then).
  useEffect(() => {
    if (!lobby?.countdown_ends_at) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    const end = new Date(lobby.countdown_ends_at).getTime() - offset.current;
    const once = setTimeout(() => void load(), Math.max(0, end - Date.now()) + 150);
    return () => {
      clearInterval(t);
      clearTimeout(once);
    };
  }, [lobby?.countdown_ends_at, load]);
  const count = lobby?.countdown_ends_at ? Math.max(0, Math.ceil((new Date(lobby.countdown_ends_at).getTime() - (now + offset.current)) / 1000)) : null;

  // The match started: go to the table.
  const gameTable = lobby?.is_seated && lobby.table_status === 'IN_GAME' ? lobby.table_id : null;
  useEffect(() => {
    if (!gameTable) return undefined;
    walletChanged();
    const t = setTimeout(() => router.replace({ pathname: '/table/[id]', params: { id: String(gameTable) } }), 500);
    return () => clearTimeout(t);
  }, [gameTable]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!user) return <Redirect href="/login" />;

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (ok) setToast({ ok: true, text: ok });
      await load();
      walletChanged();
    } catch (e) {
      setToast({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const canPick = !!lobby?.is_seated && !counting && lobby.table_status !== 'IN_GAME';
  const mySeat = pick ?? lobby?.my_seat ?? null;
  const needsConfirm = !!lobby?.is_seated && (pick !== null ? pick !== lobby.my_seat || !lobby.my_seat_confirmed : !lobby.my_seat_confirmed);

  const leave = () =>
    act(async () => {
      if (lobby?.table_id && lobby.is_seated) await api(`/tables/${lobby.table_id}/leave`, { method: 'POST' });
      router.replace('/lobby');
    });

  return (
    <Stage scene="lantern" overlay={<Toast toast={toast} />}>
      <PokerTable />

      <Squish label="Back to lobby" onPress={leave} style={styles.back}>
        <View style={styles.backFace}>
          <Text style={styles.backText}>⟵</Text>
        </View>
      </Squish>
      <View style={styles.title}>
        <Text style={styles.titleText} numberOfLines={1}>
          {lobby ? `${lobby.name} · #${lobby.lobby_id} · ${lobby.game_mode_label}` : 'Loading…'}
        </Text>
        {lobby && <Text style={styles.sub}>{lobby.banker_rule}</Text>}
      </View>

      {lobby?.seats.map((s) => (
        <SeatSpot key={s.seat} s={s} spot={SPOT_OF[s.seat] ?? 'bottom'} mine={mySeat === s.seat} canPick={canPick && s.state === 'available'} onPick={() => setPick(s.seat)} />
      ))}

      <View style={styles.center}>
        <Banner>
          {count !== null ? (
            <GameText size={64}>{count > 0 ? `Starting in ${count}` : 'Starting…'}</GameText>
          ) : (
            <GameText size={36}>{lobby?.start_hint || 'Waiting for players'}</GameText>
          )}
          {lobby && (
            <Text style={styles.small}>
              Players {lobby.seated_count ?? lobby.players}/{lobby.max_players} · Ready {lobby.ready_count} · Min. Entry {fmtChips(lobby.min_entry)} Chips
            </Text>
          )}
          {lobby && !lobby.is_seated && <CandyButton title={busy ? '…' : 'Join this lobby'} w={360} onPress={() => act(() => api(`/lobbies/${lobby.id}/join`, { method: 'POST', body: {} }))} />}
          {lobby?.is_seated && (
            <>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                {lobby.bet_chips.map((b) => (
                  <CandyButton key={b} title={`● ${fmtChips(b)}`} tone={lobby.my_bet !== null && Number(lobby.my_bet) === Number(b) ? 'gold' : 'dark'} w={170} h={60} size={26} disabled={counting || busy} onPress={() => act(() => api(`/lobbies/${lobby.id}/bet`, { method: 'POST', body: { bet: b } }))} />
                ))}
              </View>
              {lobby.my_required_chips && <Text style={styles.small}>Your bet needs {fmtChips(lobby.my_required_chips)} Chips · you have {fmtChips(lobby.my_chips)}</Text>}
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                {needsConfirm && mySeat ? (
                  <CandyButton title={`Confirm seat ${mySeat}`} tone="green" w={340} onPress={() => act(() => api(`/lobbies/${lobby.id}/seat`, { method: 'POST', body: { seat: mySeat } }).then(() => setPick(null)))} disabled={busy} />
                ) : (
                  <CandyButton title={lobby.my_ready ? 'Not ready' : 'READY'} tone={lobby.my_ready ? 'dark' : 'gold'} w={300} onPress={() => act(() => api(`/lobbies/${lobby.id}/start`, { method: 'POST', body: { ready: !lobby.my_ready } }))} disabled={busy || (!lobby.can_press_start && !lobby.my_ready)} />
                )}
              </View>
            </>
          )}
        </Banner>
      </View>
    </Stage>
  );
}

function SeatSpot({ s, spot, mine, canPick, onPick }: { s: LobbySeat; spot: Spot; mine: boolean; canPick: boolean; onPick: () => void }) {
  const p = SEAT[spot];
  const body =
    s.state === 'available' ? (
      <View style={[styles.empty, mine && styles.mine]}>
        <Text style={styles.emptyText}>{mine ? 'Your pick' : canPick ? `Seat ${s.seat}\nTap to sit` : `Seat ${s.seat}`}</Text>
      </View>
    ) : (
      <View style={{ alignItems: 'center' }}>
        <View style={[s.is_ready ? styles.ready : undefined, { opacity: s.is_connected === false ? 0.5 : 1 }]}>
          <Avatar avatar={s.avatar} userId={s.user_id} size={104} />
        </View>
        <View style={styles.nameTag}>
          <Text style={styles.name} numberOfLines={1}>
            {s.is_you ? 'You' : s.name}
            {s.is_owner ? ' 👑' : ''}
          </Text>
          <Text style={styles.status}>{s.is_ready ? 'READY' : s.state === 'reserved' ? 'Choosing…' : 'Not ready'}{s.bet ? ` · ${fmtChips(s.bet)}` : ''}</Text>
        </View>
      </View>
    );
  return (
    <View style={[styles.seat, { left: p.x - 100, top: p.y - 80 }]}>
      {canPick ? (
        <Squish label={`Seat ${s.seat}`} onPress={onPick} style={{ width: 200, height: 170 }}>
          {body}
        </Squish>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: 24, top: 18, width: 84, height: 84 },
  backFace: { flex: 1, borderRadius: 42, borderWidth: 5, borderColor: '#ffc531', backgroundColor: '#7a0a12', alignItems: 'center', justifyContent: 'center' },
  backText: { fontFamily: font.display, fontSize: 40, color: '#ffd34d', lineHeight: 46 },
  title: { position: 'absolute', left: 130, top: 22, right: 130, alignItems: 'center' },
  titleText: { fontFamily: font.display, fontSize: 34, color: '#fff' },
  sub: { fontFamily: font.bodyHeavy, fontSize: 20, color: '#ffe0a0', textAlign: 'center' },
  center: { position: 'absolute', left: 0, right: 0, top: 300, alignItems: 'center' },
  small: { fontFamily: font.bodyHeavy, fontSize: 22, color: '#fff', textAlign: 'center' },
  seat: { position: 'absolute', width: 200, alignItems: 'center' },
  empty: { width: 170, height: 150, borderRadius: 30, borderWidth: 4, borderStyle: 'dashed', borderColor: '#ffc531', backgroundColor: 'rgba(26,4,32,0.6)', alignItems: 'center', justifyContent: 'center' },
  mine: { borderStyle: 'solid', borderColor: '#4ee36b' },
  emptyText: { fontFamily: font.display, fontSize: 24, color: '#fff', textAlign: 'center' },
  ready: { borderRadius: 70, borderWidth: 5, borderColor: '#4ee36b', padding: 2 },
  nameTag: { marginTop: 4, backgroundColor: 'rgba(26,4,32,0.85)', borderRadius: 14, borderWidth: 2, borderColor: '#ffc531', paddingHorizontal: 12, alignItems: 'center', maxWidth: 220 },
  name: { fontFamily: font.display, fontSize: 24, color: '#fff' },
  status: { fontFamily: font.bodyHeavy, fontSize: 16, color: '#ffe14d' },
});
