import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { walletChanged } from '@/lib/events';
import { fmtChips, useSecondsLeft, useTable } from '@/lib/multiplayer';
import type { SeatPlayer } from '@/lib/types';
import { fmt, useBalances } from '@/lib/wallet';
import { ArrangePanel, type Rows } from '@/ui/Arrange';
import { CandyButton, GameText, Overlay, Panel, Pill, Squish, Toast } from '@/ui/kit';
import { Stage } from '@/ui/Stage';
import { Banner, PokerTable, RevealedHand, SeatBadge, type Spot } from '@/ui/Table';
import { font } from '@/ui/theme';

const RING: Spot[] = ['bottom', 'left', 'top', 'right'];
const num = (v: string | number | null | undefined) => Number(v ?? 0);

/** Multiplayer table: every phase comes from the server's session state. */
export default function Table() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tableId = Number(id) || null;
  const { table, session, refresh, removed, clockOffset } = useTable(tableId, user?.id);
  const { chips } = useBalances(user?.id);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const draft = useRef<{ id: number; rows: Rows } | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const betLeft = useSecondsLeft(session?.betting_deadline, clockOffset);
  const arrangeLeft = useSecondsLeft(session?.arrangement_deadline, clockOffset);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (removed) {
      setToast({ ok: false, text: 'You are no longer seated at this table.' });
      const t = setTimeout(() => router.replace('/lobby'), 1800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [removed]);

  const phase = session?.status ?? (table?.status === 'CLOSED' ? 'CLOSED' : 'STARTING');
  const matchOver = table?.status === 'CLOSED';
  const leaveAllowed = matchOver || table?.leave?.allowed === true;

  const leave = () => {
    if (!table) return;
    if (!leaveAllowed) {
      setToast({ ok: false, text: table.leave?.reason ?? 'You can leave during the Betting Phase.' });
      return;
    }
    Alert.alert('Leave the game?', matchOver ? 'Back to the lobby.' : 'You leave this table.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (!matchOver) await api(`/tables/${table.id}/leave`, { method: 'POST' }).catch((e) => setToast({ ok: false, text: errorText(e) }));
          walletChanged();
          router.replace('/lobby');
        },
      },
    ]);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  });

  if (!user) return <Redirect href="/login" />;

  // Seats rotated so you sit at the bottom (clockwise: left, top, right).
  const players: SeatPlayer[] = table?.players ?? [];
  const me = players.find((p) => p.is_you);
  const spotOf = (p: SeatPlayer): Spot => RING[(((p.seat - (me?.seat ?? 1)) % 4) + 4) % 4];
  const sessionPlayers = session?.players ?? players;
  const bankerId = session?.banker_user_id ?? table?.banker_user_id ?? null;

  const bet = async (amount: number) => {
    if (!session || busy) return;
    setBusy(true);
    try {
      await api(`/games/${session.id}/bet`, { method: 'POST', body: { amount: amount.toFixed(2) } });
      walletChanged();
      await refresh();
    } catch (e) {
      setToast({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  // Your draft is saved on the server (debounced): at the timer's end the server submits it for you.
  const saveDraft = (rows: Rows) => {
    if (!session) return;
    draft.current = { id: session.id, rows };
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const d = draft.current;
      if (d) api(`/games/${d.id}/draft`, { method: 'PUT', body: d.rows }).catch(() => undefined);
    }, 600);
  };

  const submit = async (rows: Rows) => {
    if (!session) return;
    setBusy(true);
    try {
      await api(`/games/${session.id}/submit`, { method: 'POST', body: rows });
      await refresh();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'timer_expired' || code === 'already_submitted' || code === 'invalid_state') {
        setToast({ ok: true, text: "Time's up — your cards were submitted as they are." });
        await refresh();
      } else setToast({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const chipsList = (session?.config.bet_chips ?? table?.room.bet_chips ?? []).map(num);
  const arranging = phase === 'ARRANGING' && !!session?.my_cards && !session.my_submission;
  const revealed = !!session?.arrangements && (phase === 'REVEALING' || phase === 'SCORING' || phase === 'COMPLETED');
  const myResult = session?.results?.find((r) => r.user_id === user.id);

  return (
    <Stage
      scene="lantern"
      overlay={
        <>
          {matchOver && table?.standings && (
            <Overlay>
              <Panel x={360} y={120} w={880} h={680} title="Match Over">
                {table.end_reason && <Text style={styles.small}>{table.end_reason}</Text>}
                {table.standings.map((s) => (
                  <View key={s.user_id} style={styles.standRow}>
                    <Text style={styles.standName}>
                      {s.rank}. {s.user_id === user.id ? 'You' : s.name}
                    </Text>
                    <Text style={styles.standMeta}>
                      W{s.won} L{s.lost} T{s.tied}
                    </Text>
                    <Text style={[styles.standName, { color: num(s.net) >= 0 ? '#7dffa0' : '#ff9aa8' }]}>
                      {num(s.net) >= 0 ? '+' : ''}
                      {fmtChips(s.net)}
                    </Text>
                  </View>
                ))}
                <CandyButton title="Back to Lobby" w={400} onPress={() => router.replace('/lobby')} style={{ alignSelf: 'center', marginTop: 24 }} />
              </Panel>
            </Overlay>
          )}
          <Toast toast={toast} />
        </>
      }
    >
      <PokerTable />

      {sessionPlayers.map((p) => {
        const res = session?.results?.find((r) => r.user_id === p.user_id);
        const sub = revealed && res ? `${num(res.net) >= 0 ? '+' : ''}${fmtChips(res.net)}` : phase === 'ARRANGING' || phase === 'SUBMITTED' ? (p.has_submitted ? '✓ Ready' : 'Arranging…') : p.bet ? `Bet ${fmtChips(p.bet)}` : undefined;
        return <SeatBadge key={p.user_id} spot={spotOf(p)} name={p.is_you ? 'You' : p.name} avatar={p.avatar} userId={p.user_id} banker={p.user_id === bankerId} active={p.is_connected} sub={sub} />;
      })}

      <Squish label="Leave" onPress={leave} style={styles.leave}>
        <View style={[styles.leaveFace, !leaveAllowed && { opacity: 0.5 }]}>
          <Text style={styles.leaveText}>⟵</Text>
        </View>
      </Squish>
      <View style={styles.info}>
        <Text style={styles.infoText} numberOfLines={1}>
          {table?.room.name ?? 'Table'} · Round {session?.round_number ?? (table?.rounds_played ?? 0) + 1}/{table?.rounds_total ?? 12}
        </Text>
      </View>
      <View style={styles.hud}>
        <Pill kind="chips" w={330} value={fmt(chips)} />
      </View>

      {table?.paused && (
        <View style={styles.center}>
          <Banner>
            <GameText size={36}>Paused</GameText>
            <Text style={styles.small}>{table.paused.message}</Text>
          </Banner>
        </View>
      )}

      {!table?.paused && !arranging && !revealed && !matchOver && (
        <View style={styles.center}>
          <Banner>
            <GameText size={44}>
              {phase === 'BETTING' ? (session?.can_bet ? `Place your bet · ${betLeft}s` : `Betting · ${betLeft}s`) : phase === 'ARRANGING' || phase === 'SUBMITTED' ? 'Waiting for the others…' : phase === 'CANCELLED' ? 'Round cancelled' : 'Starting…'}
            </GameText>
            {phase === 'BETTING' && session?.can_bet && betLeft > 0 && (
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
                {chipsList.map((b) => (
                  <CandyButton key={b} title={`● ${fmtChips(b)}`} tone={num(session.my_bet) === b ? 'gold' : 'dark'} w={200} disabled={busy} onPress={() => bet(b)} />
                ))}
              </View>
            )}
            {phase === 'BETTING' && session?.my_bet && <Text style={styles.small}>Your bet: {fmtChips(session.my_bet)} Chips{session.my_bet_type === 'AUTO' ? ' (automatic)' : ''}</Text>}
            {phase === 'BETTING' && session?.banker_user_id === user.id && <Text style={styles.small}>You are the banker this round.</Text>}
          </Banner>
        </View>
      )}

      {revealed && session?.arrangements && (
        <>
          {session.arrangements.map((a) => {
            const p = sessionPlayers.find((x) => x.user_id === a.user_id);
            return p ? <RevealedHand key={a.user_id} spot={spotOf(p)} rows={{ front: a.front, middle: a.middle, back: a.back }} labels={a.labels} foul={a.is_foul} /> : null;
          })}
          {myResult && (
            <View style={[styles.center, { top: 420 }]}>
              <Banner tone={num(myResult.net) > 0 ? 'win' : num(myResult.net) < 0 ? 'lose' : 'dark'}>
                <GameText size={46}>{num(myResult.net) > 0 ? 'PUSOY!' : num(myResult.net) < 0 ? 'ARAYYY KOOOO!' : 'EVEN'}</GameText>
                <Text style={styles.small}>
                  {num(myResult.net) >= 0 ? '+' : ''}
                  {fmtChips(myResult.net)} Chips{myResult.penalty ? ` · ${myResult.penalty === 'false_lucky' ? 'false Lucky Hand' : 'misarranged'}` : ''}
                </Text>
              </Banner>
            </View>
          )}
        </>
      )}

      {arranging && session?.my_cards && (
        <ArrangePanel key={session.id} cards={session.my_cards} initial={session.my_draft ?? null} previewPath={`/games/${session.id}/preview`} busy={busy} secondsLeft={arrangeLeft} onChange={saveDraft} onSubmit={submit} />
      )}
    </Stage>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', left: 0, right: 0, top: 330, alignItems: 'center' },
  leave: { position: 'absolute', left: 24, top: 18, width: 84, height: 84 },
  leaveFace: { flex: 1, borderRadius: 42, borderWidth: 5, borderColor: '#ffc531', backgroundColor: '#7a0a12', alignItems: 'center', justifyContent: 'center' },
  leaveText: { fontFamily: font.display, fontSize: 40, color: '#ffd34d', lineHeight: 46 },
  info: { position: 'absolute', left: 130, top: 30, backgroundColor: 'rgba(26,4,32,0.85)', borderRadius: 24, borderWidth: 3, borderColor: '#ffc531', paddingHorizontal: 20, paddingVertical: 8, maxWidth: 900 },
  infoText: { fontFamily: font.display, fontSize: 26, color: '#fff' },
  hud: { position: 'absolute', right: 24, top: 24 },
  small: { fontFamily: font.bodyHeavy, fontSize: 24, color: '#fff', textAlign: 'center' },
  standRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  standName: { fontFamily: font.display, fontSize: 32, color: '#fff' },
  standMeta: { fontFamily: font.bodyHeavy, fontSize: 22, color: '#ffe0a0' },
});
