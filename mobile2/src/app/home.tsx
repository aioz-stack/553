import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { FriendsData, TableState } from '@/lib/types';
import { fmt, useBalances, useGold } from '@/lib/wallet';
import { Art } from '@/ui/Art';
import { Bob } from '@/ui/Bob';
import { Avatar, CandyButton, GameText, Overlay, Panel, Pill, Squish, Tile, Toast } from '@/ui/kit';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { Stage } from '@/ui/Stage';
import { font, GOLD_RIM } from '@/ui/theme';

interface PracticeTier {
  key: string;
  name: string;
  stars: number;
  min_gold: number;
  bets: number[];
  eligible: boolean;
}

const TIER_COLORS: Record<string, readonly [string, string]> = {
  beginner: ['#3ed47a', '#0f7a34'],
  intermediate: ['#6f9ad8', '#22477e'],
  advanced: ['#a678e0', '#4b2398'],
  mastery: ['#d8636f', '#7a1020'],
};

/** Home: the landscape lobby over the animated beach (same layout and coordinates as the web app). */
export default function Home() {
  const { user, logout } = useAuth();
  const { chips, keys } = useBalances(user?.id);
  const { gold } = useGold(user?.id);
  const [panel, setPanel] = useState<'single' | 'settings' | null>(null);
  const [seat, setSeat] = useState<TableState | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ data: TableState | null }>('/tables/current')
      .then((r) => setSeat(r.data && r.data.status !== 'CLOSED' ? r.data : null))
      .catch(() => setSeat(null));
  }, [user]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!user) return <Redirect href="/login" />;

  const name = user.display_name ?? user.name;
  const level = user.level;
  const xpPct = level && level.for_next > 0 ? Math.min(100, Math.round((level.into_level / level.for_next) * 100)) : 0;

  return (
    <Stage
      scene="beach"
      overlay={
        <>
          {panel === 'single' && <SinglePlayerPicker onClose={() => setPanel(null)} />}
          {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
          <Toast toast={toast} />
        </>
      }
    >
      {/* Profile */}
      <View style={[styles.abs, { left: 40, top: 22, flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
        <Avatar avatar={user.avatar} userId={user.id} size={150} />
        <View>
          <GameText size={52} numberOfLines={1}>
            {name.length > 14 ? `${name.slice(0, 13)}…` : name}
          </GameText>
          <LinearGradient colors={GOLD_RIM} style={styles.levelRim}>
            <View style={styles.levelBody}>
              <LinearGradient colors={['#ffd75a', '#e89a00']} style={styles.levelTag}>
                <Text style={styles.levelText}>Lv. {level?.level ?? 1}</Text>
              </LinearGradient>
              <View style={styles.xpTrack}>
                <LinearGradient colors={['#fff3a0', '#ffc531']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.xpFill, { width: `${xpPct}%` }]} />
              </View>
            </View>
          </LinearGradient>
        </View>
      </View>

      {/* Logo crest */}
      <Bob seconds={5} style={[styles.abs, { left: 488, top: 0, width: 600, height: 250 }]}>
        <Art name="home-crest" width={600} />
        <Art name="home-title" width={560} style={{ position: 'absolute', left: 20, top: 90 }} />
      </Bob>

      {/* Wallets: Gold (Single Player), Chips (Multiplayer), Keys */}
      <View style={[styles.abs, { right: 24, top: 50, gap: 12, alignItems: 'flex-end' }]}>
        <Pill kind="gold" value={fmt(gold ? (gold.total ?? gold.gold) : undefined)} />
        <Pill kind="chips" value={fmt(chips)} />
        <Pill kind="keys" value={fmt(keys)} onPlus={() => setToast({ ok: true, text: 'The Shop is coming to the new app soon.' })} />
      </View>

      {/* Friends */}
      <View style={[styles.abs, { left: 25, top: 215, width: 440, height: 660 }]}>
        <FriendsPanel />
      </View>

      {/* Return to an active seat */}
      {seat && (
        <Squish label="Return to your table" onPress={() => router.push({ pathname: '/table/[id]', params: { id: String(seat.id) } })} style={[styles.abs, { left: 495, top: 228, width: 640, height: 46 }]}>
          <View style={styles.seatBanner}>
            <Text style={styles.seatText}>● You have a seat at {seat.room.name} — tap to return</Text>
          </View>
        </Squish>
      )}

      <Tile x={495} y={284} w={520} h={350} from="#c477ff" to="#5a14b8" label="Single Player" onPress={() => setPanel('single')}>
        <Art name="tile-single-art" width={440} />
        <Art name="label-single" width={490} style={{ marginTop: -32 }} />
      </Tile>
      <Tile x={1040} y={284} w={520} h={350} from="#ff6b5c" to="#9c0a12" label="Multiplayer" onPress={() => router.push('/lobby')}>
        <Art name="tile-multi-art" width={440} />
        <Art name="label-multi" width={490} style={{ marginTop: -32 }} />
      </Tile>
      <Tile x={515} y={660} w={320} h={210} from="#5ef08a" to="#0f7a34" label="Shop" onPress={() => setToast({ ok: true, text: 'The Shop is coming to the new app soon.' })}>
        <Art name="tile-shop-art" width={120} />
        <Art name="label-shop" width={300} />
      </Tile>
      <Tile x={858} y={660} w={320} h={210} from="#6fd4ff" to="#1560d0" label="Settings" onPress={() => setPanel('settings')}>
        <Art name="tile-settings-art" width={110} />
        <Art name="label-settings" width={300} />
      </Tile>
      <Tile x={1201} y={660} w={320} h={210} from="#ff86b6" to="#d81b60" label="Logout" onPress={logout}>
        <Art name="tile-logout-art" width={120} />
        <Art name="label-logout" width={300} />
      </Tile>
    </Stage>
  );
}

/** Friends list (accepted friends, online first). Display only; requests are managed on the web for now. */
function FriendsPanel() {
  const [data, setData] = useState<FriendsData | null>(null);
  const load = useCallback(() => {
    api<{ data: FriendsData }>('/friends')
      .then((r) => setData(r.data))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  const friends = [...(data?.friends ?? [])].sort((a, b) => Number(b.online) - Number(a.online));
  return (
    <LinearGradient colors={GOLD_RIM} style={{ flex: 1, borderRadius: 40, padding: 8 }}>
      <LinearGradient colors={['#3a1f4a', '#1f1028']} style={{ flex: 1, borderRadius: 33, padding: 18 }}>
        <View style={styles.friendsHead}>
          <Text style={styles.friendsTitle}>👥 Friends List ({friends.length})</Text>
        </View>
        <ScrollView contentContainerStyle={{ gap: 10, paddingTop: 12 }}>
          {friends.length === 0 && <Text style={styles.muted}>No friends yet. Add friends by username on the web app.</Text>}
          {friends.map((f) => (
            <View key={f.id} style={styles.friendRow}>
              <Avatar avatar={f.avatar} userId={f.user_id} size={70} />
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={[styles.muted, { color: f.online ? '#4ee36b' : '#bba9c8' }]}>{f.in_game ? `Playing${f.room_name ? ` · ${f.room_name}` : ''}` : f.online ? '● Online' : '● Offline'}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </LinearGradient>
    </LinearGradient>
  );
}

/** Single Player — pick a difficulty and a bet (the server checks your Gold before dealing). */
function SinglePlayerPicker({ onClose }: { onClose: () => void }) {
  const [tiers, setTiers] = useState<PracticeTier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ data: PracticeTier[] }>('/practice/tiers')
      .then((r) => setTiers(r.data))
      .catch((e) => setError(errorText(e)));
  }, []);
  const go = (tier: string, bet: number) => {
    onClose();
    router.push({ pathname: '/practice', params: { tier, bet: String(bet) } });
  };
  return (
    <Overlay onClose={onClose}>
      <Panel x={190} y={150} w={1220} h={700} title="Single Player" onClose={onClose}>
        <Text style={styles.subtitle}>◆ Select Difficulty Level ◆</Text>
        {error && <Text style={styles.muted}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: 26, justifyContent: 'center', marginTop: 20 }}>
          {(tiers ?? []).map((t) => (
            <LinearGradient key={t.key} colors={t.eligible ? GOLD_RIM : ['#c9c9d6', '#8a8aa0', '#4a4a5a']} style={{ width: 262, borderRadius: 30, padding: 6, opacity: t.eligible ? 1 : 0.8 }}>
              <LinearGradient colors={TIER_COLORS[t.key] ?? ['#6a5cf0', '#3e33a8']} style={{ borderRadius: 25, padding: 16, alignItems: 'center', gap: 10, height: 440 }}>
                <Text style={styles.stars}>{'★'.repeat(Math.max(1, t.stars))}</Text>
                <GameText size={44} fill="#fff" stroke="#3a1a00" numberOfLines={1}>
                  {t.name}
                </GameText>
                <View style={styles.minGold}>
                  <Text style={styles.minLabel}>Minimum Gold:</Text>
                  <Text style={styles.minValue}>{fmt(t.min_gold)}</Text>
                </View>
                <Text style={styles.minLabel}>{t.eligible ? 'Bet Options:' : 'Locked'}</Text>
                {t.bets.map((b) => (
                  <CandyButton key={b} title={`● ${fmt(b)}`} tone="dark" w={220} h={58} size={24} disabled={!t.eligible} onPress={() => go(t.key, b)} />
                ))}
              </LinearGradient>
            </LinearGradient>
          ))}
        </View>
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  levelRim: { marginTop: 4, width: 330, height: 52, borderRadius: 26, padding: 5 },
  levelBody: { flex: 1, borderRadius: 22, backgroundColor: '#241433', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  levelTag: { height: 44, borderRadius: 22, paddingHorizontal: 12, justifyContent: 'center', marginLeft: -2 },
  levelText: { fontFamily: font.display, fontSize: 28, color: '#5a2600', includeFontPadding: false },
  xpTrack: { flex: 1, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 11 },
  seatBanner: { flex: 1, borderRadius: 23, borderWidth: 4, borderColor: '#4ee36b', backgroundColor: 'rgba(15,42,28,0.92)', alignItems: 'center', justifyContent: 'center' },
  seatText: { fontFamily: font.display, fontSize: 24, color: '#fff' },
  friendsHead: { height: 70, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', paddingHorizontal: 18 },
  friendsTitle: { fontFamily: font.display, fontSize: 32, color: '#ffe14d' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 10 },
  friendName: { fontFamily: font.display, fontSize: 30, color: '#fff' },
  muted: { fontFamily: font.body, fontSize: 22, color: '#bba9c8', textAlign: 'left' },
  subtitle: { fontFamily: font.display, fontSize: 40, color: '#fff', textAlign: 'center' },
  stars: { fontSize: 40, color: '#ffe14d' },
  minGold: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 20, alignItems: 'center', width: '100%' },
  minLabel: { fontFamily: font.bodyHeavy, fontSize: 20, color: '#fff' },
  minValue: { fontFamily: font.display, fontSize: 34, color: '#ffe14d' },
});
