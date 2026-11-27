import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, errorText, requestKey } from '@/lib/api';
import { BOT_AVATARS } from '@/lib/avatars';
import { useAuth } from '@/lib/auth';
import { walletChanged } from '@/lib/events';
import { fmt, useGold } from '@/lib/wallet';
import { ArrangePanel, type Lane, type Rows } from '@/ui/Arrange';
import { CandyButton, GameText, Overlay, Panel, Pill, Squish, Toast } from '@/ui/kit';
import { Stage } from '@/ui/Stage';
import { Banner, PokerTable, RevealedHand, SeatBadge, type Spot } from '@/ui/Table';
import { font } from '@/ui/theme';

interface PracticeTier {
  key: string;
  name: string;
  min_gold: number;
  bets: number[];
  eligible: boolean;
}

interface RoundPlayer {
  seat: number;
  name: string;
  is_you: boolean;
  is_banker: boolean;
  bet: number;
  front?: string[];
  middle?: string[];
  back?: string[];
  labels?: Record<Lane, string>;
  is_foul?: boolean;
  lucky?: { type: string; label: string } | null;
  gold?: number;
}

interface RoundState {
  id: number;
  status: 'arranging' | 'completed' | 'abandoned';
  round: number;
  rounds_total: number;
  banker: number;
  banker_name: string;
  tier: { key: string; name: string };
  bet: number;
  cards: string[];
  players: RoundPlayer[];
  result: { lanes: Record<Lane, number> | null; multiple: number | null; gold: number; misplaced?: boolean; lucky_failed?: boolean } | null;
  lucky?: { type: string; label: string; multiplier: number } | null;
}

interface MatchState {
  id: number;
  status: 'active' | 'completed' | 'abandoned' | 'out_of_gold';
  out_of_gold?: boolean;
  tier: { key: string; name: string };
  rounds_total: number;
  rounds_played: number;
  next_round: number | null;
  next_banker: number | null;
  next_banker_name: string | null;
  gold: number;
  standings: Array<{ seat: number; name: string; gold: number }>;
  current: RoundState | null;
}

const BOT_SPOT: Record<number, Spot> = { 2: 'left', 3: 'top', 4: 'right' };
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

/**
 * Single Player — Round Bank Pusoy against three server bots. The server deals, plays the bots,
 * validates your arrangement and settles Gold; this screen only shows it.
 */
export default function Practice() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tier?: string; bet?: string }>();
  const { gold } = useGold(user?.id);
  const [tier, setTier] = useState<PracticeTier | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [phase, setPhase] = useState<'loading' | 'betting' | 'arranging' | 'revealed'>('loading');
  const [bet, setBet] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const started = useRef(false);
  const inFlight = useRef(false);

  const say = useCallback((ok: boolean, text: string) => setToast({ ok, text }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const outOfGold = useCallback(() => {
    Alert.alert('Out of Gold', 'You ran out of Gold. Claim free Gold from Home to keep playing.', [{ text: 'OK', onPress: () => router.replace('/home') }]);
  }, []);

  const newMatch = useCallback(async (t: PracticeTier) => {
    const r = await api<{ data: MatchState }>('/practice/matches', { method: 'POST', body: { tier: t.key } });
    setMatch(r.data);
    setRound(null);
    setPhase('betting');
    return r.data;
  }, []);

  // Load: resume your active match at this tier, or start a new one.
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    (async () => {
      try {
        const [tiers, current] = await Promise.all([api<{ data: PracticeTier[]; meta?: { gold_wallet?: { out_of_gold?: boolean } } }>('/practice/tiers'), api<{ data: MatchState | null }>('/practice/matches/current')]);
        if (tiers.meta?.gold_wallet?.out_of_gold && !current.data?.current) {
          outOfGold();
          return;
        }
        const t = tiers.data.find((x) => x.key === params.tier) ?? null;
        if (!t) {
          router.replace('/home');
          return;
        }
        setTier(t);
        const wanted = Number(params.bet);
        setBet(t.bets.includes(wanted) ? wanted : t.bets[0]);
        if (current.data && current.data.tier.key === t.key) {
          setMatch(current.data);
          if (current.data.current) {
            setRound(current.data.current);
            setPhase('arranging');
          } else setPhase('betting');
          return;
        }
        if (!t.eligible) {
          setPhase('betting');
          return;
        }
        await newMatch(t);
      } catch (e) {
        say(false, errorText(e));
        setPhase('betting');
      }
    })();
  }, [user, params.tier, params.bet, newMatch, say, outOfGold]);

  /** Deal a round: `amount` is your bet, null when you are the banker (you cover the others). */
  const deal = async (amount: number | null) => {
    if (!tier || inFlight.current) return;
    if (!tier.eligible) {
      say(false, `Not enough gold for ${tier.name}. You need at least ${fmt(tier.min_gold)} gold.`);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const m = match && match.status === 'active' ? match : await newMatch(tier);
      const r = await api<{ data: RoundState }>(`/practice/matches/${m.id}/deal`, { method: 'POST', body: { ...(amount !== null ? { bet: amount } : {}), request_id: requestKey() } });
      if (amount !== null) setBet(amount);
      setRound(r.data);
      setMatch((x) => (x ? { ...x, current: r.data, next_round: null, next_banker: null, next_banker_name: null } : x));
      setPhase('arranging');
      walletChanged();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === 'out_of_gold') outOfGold();
      else say(false, code === 'insufficient_gold' ? `Not enough gold for ${tier.name}. You need at least ${fmt(tier.min_gold)} gold.` : errorText(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const submit = async (rows: Rows) => {
    if (!round) return;
    setBusy(true);
    try {
      const r = await api<{ data: RoundState }>(`/practice/${round.id}/submit`, { method: 'POST', body: rows });
      setRound(r.data);
      setPhase('revealed');
      walletChanged();
      if (match) {
        const m = await api<{ data: MatchState }>(`/practice/matches/${match.id}`);
        setMatch(m.data);
        if (m.data.out_of_gold) setTimeout(outOfGold, 2600);
        else if (m.data.status === 'completed') setTimeout(() => setSummary(true), 1800);
      }
    } catch (e) {
      say(false, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = useCallback(() => {
    Alert.alert('Leave Single Player?', round && phase === 'arranging' ? 'Your unsubmitted round is void and its Gold reserve is returned.' : 'Your match ends here.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (match && match.status === 'active') await api(`/practice/matches/${match.id}/leave`, { method: 'POST' }).catch(() => undefined);
          walletChanged();
          router.replace('/home');
        },
      },
    ]);
  }, [match, round, phase]);

  // Android back button follows the Leave rules.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);

  if (!user) return <Redirect href="/login" />;

  const bankerSeat = phase === 'betting' ? (match?.next_banker ?? 1) : (round?.banker ?? 1);
  const youBank = bankerSeat === 1;
  const roundNo = phase === 'betting' ? (match?.next_round ?? (match?.rounds_played ?? 0) + 1) : (round?.round ?? 1);
  const players = round?.players ?? [];
  const nameOf = (seat: number) => (seat === 1 ? (user.display_name ?? user.name) : (players.find((p) => p.seat === seat)?.name ?? ['', '', 'LuckyBot', 'CardBot', 'AceBot'][seat]));
  const myGold = round?.result?.gold ?? 0;

  return (
    <Stage
      scene="lantern"
      overlay={
        <>
          {summary && match && (
            <Overlay>
              <Panel x={400} y={140} w={800} h={640} title="Match Over">
                <Text style={styles.big}>{match.tier.name} · {match.rounds_played} rounds</Text>
                {[...match.standings].sort((a, b) => b.gold - a.gold).map((s, i) => (
                  <View key={s.seat} style={styles.standRow}>
                    <Text style={styles.standName}>
                      {i + 1}. {s.seat === 1 ? 'You' : s.name}
                    </Text>
                    <Text style={[styles.standGold, { color: s.gold >= 0 ? '#7dffa0' : '#ff9aa8' }]}>{signed(s.gold)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 20, justifyContent: 'center', marginTop: 24 }}>
                  <CandyButton title="Home" tone="dark" w={260} onPress={() => router.replace('/home')} />
                  <CandyButton
                    title="Play Again"
                    w={300}
                    onPress={async () => {
                      setSummary(false);
                      if (tier) await newMatch(tier).catch((e) => say(false, errorText(e)));
                    }}
                  />
                </View>
              </Panel>
            </Overlay>
          )}
          <Toast toast={toast} />
        </>
      }
    >
      <PokerTable />

      {/* Seats: you at the bottom, the bots left / top / right. */}
      <SeatBadge spot="bottom" name="You" avatar={user.avatar} userId={user.id} banker={bankerSeat === 1} sub={phase === 'revealed' && round?.result ? `${signed(myGold)} Gold` : undefined} />
      {[2, 3, 4].map((seat) => {
        const p = players.find((x) => x.seat === seat);
        return <SeatBadge key={seat} spot={BOT_SPOT[seat]} name={nameOf(seat)} avatar={BOT_AVATARS[seat]} banker={bankerSeat === seat} sub={phase === 'revealed' && p?.gold !== undefined ? `${signed(p.gold)}` : p && !p.is_banker && p.bet ? `Bet ${fmt(p.bet)}` : undefined} />;
      })}

      {/* Top bar: leave, round, Gold */}
      <Squish label="Leave" onPress={leave} style={styles.leave}>
        <View style={styles.leaveFace}>
          <Text style={styles.leaveText}>⟵</Text>
        </View>
      </Squish>
      <View style={styles.roundInfo}>
        <Text style={styles.roundText}>
          {tier?.name ?? 'Single Player'} · Round {roundNo}/{match?.rounds_total ?? 12} · {youBank ? 'You bank' : `${nameOf(bankerSeat)} banks`}
        </Text>
      </View>
      <View style={styles.goldHud}>
        <Pill kind="gold" w={330} value={fmt(gold ? (gold.total ?? gold.gold) : undefined)} />
      </View>

      {phase === 'loading' && (
        <View style={styles.center}>
          <Banner>
            <GameText size={44}>Shuffling…</GameText>
          </Banner>
        </View>
      )}

      {phase === 'betting' && tier && (
        <View style={styles.center}>
          <Banner>
            <GameText size={46}>{youBank ? 'You are the banker' : 'Place your bet'}</GameText>
            <Text style={styles.small}>{youBank ? 'No bet: you cover the other players’ bets.' : `${tier.name} bets — the round deals as soon as you choose.`}</Text>
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
              {youBank ? (
                <CandyButton title={busy ? '…' : 'DEAL'} w={300} onPress={() => deal(null)} disabled={busy} />
              ) : (
                tier.bets.map((b) => <CandyButton key={b} title={`● ${fmt(b)}`} tone={b === bet ? 'gold' : 'dark'} w={220} onPress={() => deal(b)} disabled={busy} />)
              )}
            </View>
          </Banner>
        </View>
      )}

      {phase === 'revealed' && round && (
        <>
          {players.map((p) => (
            <RevealedHand key={p.seat} spot={p.seat === 1 ? 'bottom' : BOT_SPOT[p.seat]} rows={{ front: p.front, middle: p.middle, back: p.back }} labels={p.labels} foul={p.is_foul} />
          ))}
          <View style={[styles.center, { top: 400 }]}>
            <Banner tone={myGold > 0 ? 'win' : myGold < 0 ? 'lose' : 'dark'}>
              <GameText size={50}>{round.lucky ? `${round.lucky.label.toUpperCase()} – LUCKY HAND` : myGold > 0 ? 'PUSOY!' : myGold < 0 ? 'ARAYYY KOOOO!' : 'EVEN'}</GameText>
              <Text style={styles.small}>{round.result ? `${signed(myGold)} Gold${round.result.multiple ? ` · ${round.result.multiple}× bet` : ''}${round.result.misplaced ? ' · misarranged' : ''}` : 'You were the banker this round.'}</Text>
              {match?.status === 'active' && match.next_round && <CandyButton title="NEXT ROUND" w={340} onPress={() => setPhase('betting')} style={{ marginTop: 8 }} />}
            </Banner>
          </View>
        </>
      )}

      {phase === 'arranging' && round && round.status === 'arranging' && (
        <ArrangePanel key={round.id} cards={round.cards} previewPath={`/practice/${round.id}/preview`} busy={busy} onSubmit={submit} />
      )}
    </Stage>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', left: 0, right: 0, top: 330, alignItems: 'center' },
  leave: { position: 'absolute', left: 24, top: 18, width: 84, height: 84 },
  leaveFace: { flex: 1, borderRadius: 42, borderWidth: 5, borderColor: '#ffc531', backgroundColor: '#7a0a12', alignItems: 'center', justifyContent: 'center' },
  leaveText: { fontFamily: font.display, fontSize: 40, color: '#ffd34d', lineHeight: 46 },
  roundInfo: { position: 'absolute', left: 130, top: 30, backgroundColor: 'rgba(26,4,32,0.85)', borderRadius: 24, borderWidth: 3, borderColor: '#ffc531', paddingHorizontal: 20, paddingVertical: 8 },
  roundText: { fontFamily: font.display, fontSize: 26, color: '#fff' },
  goldHud: { position: 'absolute', right: 24, top: 24 },
  small: { fontFamily: font.bodyHeavy, fontSize: 24, color: '#fff', textAlign: 'center' },
  big: { fontFamily: font.display, fontSize: 34, color: '#ffe14d', textAlign: 'center', marginBottom: 12 },
  standRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  standName: { fontFamily: font.display, fontSize: 32, color: '#fff' },
  standGold: { fontFamily: font.display, fontSize: 32 },
});
