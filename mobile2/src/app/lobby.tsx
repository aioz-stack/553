import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { walletChanged } from '@/lib/events';
import { fmtChips, useLobbyUpdates, type LobbyDetail, type LobbyList, type LobbySummary, type LobbyTab } from '@/lib/multiplayer';
import { fmt, useBalances } from '@/lib/wallet';
import { Avatar, CandyButton, Overlay, Panel, Pill, Squish, Toast } from '@/ui/kit';
import { Stage } from '@/ui/Stage';
import { font, GOLD_RIM } from '@/ui/theme';

const STATUS: Record<LobbySummary['status'], { text: string; color: string }> = {
  waiting: { text: 'Waiting', color: '#4ee36b' },
  full: { text: 'Full', color: '#ffc531' },
  in_game: { text: 'In game', color: '#ff9aa8' },
  closed: { text: 'Closed', color: '#9c8aa8' },
};

/** The Multiplayer lobby list (live): Quick Join, tabs, search, join a lobby. */
export default function Lobby() {
  const { user } = useAuth();
  const { chips, keys } = useBalances(user?.id);
  const [tab, setTab] = useState<LobbyTab>('all');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<LobbyList | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinFor, setJoinFor] = useState<LobbySummary | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    api<LobbyList>('/lobbies', { query: { tab, search: search.trim() || undefined, page: 1 } })
      .then(setList)
      .catch(() => undefined);
  }, [tab, search]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useLobbyUpdates(load);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!user) return <Redirect href="/login" />;

  const enter = (lobby: LobbyDetail | LobbySummary) => {
    walletChanged();
    router.push({ pathname: '/room/[id]', params: { id: String(lobby.id) } });
  };

  const quickJoin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ data: LobbyDetail }>('/lobbies/quick-join', { method: 'POST' });
      enter(r.data);
    } catch (e) {
      setToast({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const rows = list?.data ?? [];
  const counts = list?.meta.counts;
  const myLobby = list?.meta.my_lobby_id ?? null;
  const otherTable = list?.meta.other_table_id ?? null;

  return (
    <Stage
      scene="lantern"
      overlay={
        <>
          {joinFor && <JoinPanel lobby={joinFor} onClose={() => setJoinFor(null)} onJoined={(d) => { setJoinFor(null); enter(d); }} />}
          <Toast toast={toast} />
        </>
      }
    >
      {/* Profile + leave */}
      <View style={[styles.abs, { left: 20, top: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <Avatar avatar={user.avatar} userId={user.id} size={110} />
        <View>
          <Text style={styles.name}>{user.display_name ?? user.name}</Text>
          <Text style={styles.id}>ID: {user.id}</Text>
        </View>
      </View>
      <Squish label="Leave Multiplayer Lobby" onPress={() => router.replace('/home')} style={[styles.abs, { left: 20, top: 150, width: 370, height: 62 }]}>
        <LinearGradient colors={['#3a0a0a', '#1a0404']} style={styles.leave}>
          <Text style={styles.leaveText}>⟵ Leave Multiplayer Lobby</Text>
        </LinearGradient>
      </Squish>

      {/* Balances */}
      <View style={[styles.abs, { left: 760, top: 30, flexDirection: 'row', gap: 16 }]}>
        <Pill kind="chips" w={380} value={fmt(chips)} />
        <Pill kind="keys" w={300} value={fmt(keys)} />
      </View>

      <CandyButton title={busy ? '…' : '⚡ Quick Join'} w={350} h={96} size={42} onPress={quickJoin} style={[styles.abs, { left: 460, top: 150 }]} />
      <CandyButton title="Create Lobby" tone="purple" w={370} h={96} size={42} onPress={() => setToast({ ok: true, text: 'Create Lobby is coming to the new app soon — use Quick Join or join a lobby.' })} style={[styles.abs, { left: 1230, top: 150 }]} />

      {/* Tabs + search */}
      <View style={[styles.abs, { left: 405, top: 280, flexDirection: 'row', gap: 16, alignItems: 'center' }]}>
        {(['all', 'public', 'private'] as LobbyTab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t && { color: '#5a2600' }]}>
              {t === 'all' ? 'All' : t === 'public' ? 'Public Lobby' : 'Private Lobby'} ({counts?.[t] ?? 0})
            </Text>
          </Pressable>
        ))}
        <TextInput value={search} onChangeText={setSearch} placeholder="🔍 Search lobby ID or name…" placeholderTextColor="#bba9c8" style={styles.search} />
      </View>

      {/* Lobby table */}
      <LinearGradient colors={GOLD_RIM} style={[styles.abs, styles.tableRim]}>
        <View style={styles.tableBody}>
          <View style={styles.headRow}>
            {['Lobby Name', 'Mode', 'Bet', 'Min. Entry', 'Players', 'Status', ''].map((h, i) => (
              <Text key={i} style={[styles.head, { flex: COLS[i] }]}>
                {h}
              </Text>
            ))}
          </View>
          <FlatList
            data={rows}
            keyExtractor={(l) => String(l.id)}
            ListEmptyComponent={<Text style={styles.empty}>{list ? 'No open lobbies yet.' : 'Loading…'}</Text>}
            renderItem={({ item: l }) => (
              <View style={styles.row}>
                <Text style={[styles.cell, { flex: COLS[0] }]} numberOfLines={1}>
                  {l.type === 'private' ? '🔒 ' : ''}
                  {l.name} <Text style={styles.dim}>#{l.lobby_id}</Text>
                </Text>
                <Text style={[styles.cell, { flex: COLS[1] }]}>{l.game_mode_label}</Text>
                <Text style={[styles.cell, { flex: COLS[2] }]}>{l.bet_chips.map(fmtChips).join(' / ')}</Text>
                <Text style={[styles.cell, { flex: COLS[3] }]}>{fmtChips(l.min_entry)}</Text>
                <Text style={[styles.cell, { flex: COLS[4] }]}>
                  {l.players}/{l.max_players}
                </Text>
                <Text style={[styles.cell, { flex: COLS[5], color: STATUS[l.status].color }]}>{STATUS[l.status].text}</Text>
                <View style={{ flex: COLS[6], alignItems: 'flex-end' }}>
                  {l.is_mine ? (
                    <CandyButton title="Open" tone="green" w={150} h={54} size={24} onPress={() => enter(l)} />
                  ) : (
                    <CandyButton title="Join" tone="purple" w={150} h={54} size={24} disabled={!l.can_join} onPress={() => setJoinFor(l)} />
                  )}
                </View>
              </View>
            )}
          />
        </View>
      </LinearGradient>

      {(myLobby || otherTable) && (
        <Squish
          label="Return"
          onPress={() => (otherTable ? router.push({ pathname: '/table/[id]', params: { id: String(otherTable) } }) : router.push({ pathname: '/room/[id]', params: { id: String(myLobby) } }))}
          style={[styles.abs, { left: 24, bottom: 24, width: 420, height: 70 }]}
        >
          <View style={styles.returnBox}>
            <Text style={styles.returnText}>{otherTable ? '▶ Return to your table' : '▶ Return to your lobby'}</Text>
          </View>
        </Squish>
      )}
    </Stage>
  );
}

const COLS = [3, 1.6, 1.6, 1.3, 1, 1.1, 1.5];

/** Join confirmation: the lobby's bets, Minimum Entry, Keys fee — and the password for private lobbies. */
function JoinPanel({ lobby, onClose, onJoined }: { lobby: LobbySummary; onClose: () => void; onJoined: (d: LobbyDetail) => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ data: LobbyDetail }>(`/lobbies/${lobby.id}/join`, { method: 'POST', body: lobby.type === 'private' ? { password } : {} });
      onJoined(r.data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Overlay onClose={onClose}>
      <Panel x={430} y={180} w={740} h={560} title="Join Lobby" onClose={onClose}>
        <Text style={styles.jTitle}>{lobby.name}</Text>
        <Text style={styles.jLine}>{lobby.game_mode_label} · Lobby #{lobby.lobby_id}</Text>
        <Text style={styles.jLine}>Bets: {lobby.bet_chips.map(fmtChips).join(' / ')} Chips</Text>
        <Text style={styles.jLine}>Minimum Entry: {fmtChips(lobby.min_entry)} Chips</Text>
        {lobby.key_fee > 0 && <Text style={styles.jLine}>Keys fee when the game starts: {lobby.key_fee}</Text>}
        {lobby.type === 'private' && <TextInput value={password} onChangeText={setPassword} placeholder="Lobby password" placeholderTextColor="#bba9c8" secureTextEntry style={[styles.search, { width: '100%', marginTop: 14 }]} />}
        {error && <Text style={[styles.jLine, { color: '#ff9aa8' }]}>{error}</Text>}
        <CandyButton title={busy ? '…' : 'Confirm Join'} w={360} onPress={confirm} disabled={busy} style={{ alignSelf: 'center', marginTop: 24 }} />
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  name: { fontFamily: font.display, fontSize: 38, color: '#fff' },
  id: { fontFamily: font.display, fontSize: 24, color: '#ffc531' },
  leave: { flex: 1, borderRadius: 31, borderWidth: 4, borderColor: '#ffc531', justifyContent: 'center', paddingHorizontal: 20 },
  leaveText: { fontFamily: font.display, fontSize: 26, color: '#fff' },
  tab: { height: 60, paddingHorizontal: 22, borderRadius: 18, borderWidth: 3, borderColor: '#ffc531', backgroundColor: '#3a0a0a', justifyContent: 'center' },
  tabOn: { backgroundColor: '#ffc531' },
  tabText: { fontFamily: font.display, fontSize: 26, color: '#fff' },
  search: { width: 400, height: 60, borderRadius: 30, borderWidth: 3, borderColor: '#ffc531', backgroundColor: 'rgba(26,4,10,0.9)', color: '#fff', fontFamily: font.body, fontSize: 22, paddingHorizontal: 22 },
  tableRim: { left: 405, top: 365, width: 1160, height: 500, borderRadius: 34, padding: 6 },
  tableBody: { flex: 1, borderRadius: 28, backgroundColor: 'rgba(58,10,20,0.95)', paddingHorizontal: 24, paddingTop: 12 },
  headRow: { flexDirection: 'row', paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'rgba(255,197,49,0.4)' },
  head: { fontFamily: font.display, fontSize: 24, color: '#ffe0a0' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  cell: { fontFamily: font.display, fontSize: 24, color: '#fff' },
  dim: { color: '#bba9c8', fontSize: 18 },
  empty: { fontFamily: font.display, fontSize: 32, color: '#fff', textAlign: 'center', marginTop: 80 },
  returnBox: { flex: 1, borderRadius: 24, borderWidth: 4, borderColor: '#ffd34d', backgroundColor: 'rgba(58,42,2,0.95)', justifyContent: 'center', paddingHorizontal: 20 },
  returnText: { fontFamily: font.display, fontSize: 28, color: '#fff' },
  jTitle: { fontFamily: font.display, fontSize: 42, color: '#ffe14d', textAlign: 'center' },
  jLine: { fontFamily: font.bodyHeavy, fontSize: 26, color: '#fff', textAlign: 'center', marginTop: 6 },
});
