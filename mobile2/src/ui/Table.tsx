import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Art } from './Art';
import type { Lane } from './Arrange';
import { Avatar, PlayingCard } from './kit';
import { font } from './theme';

export type Spot = 'bottom' | 'left' | 'top' | 'right';

/** Seat anchors on the 1600×900 table (avatar centre). */
export const SEAT: Record<Spot, { x: number; y: number }> = {
  bottom: { x: 800, y: 800 },
  left: { x: 110, y: 450 },
  top: { x: 800, y: 80 },
  right: { x: 1490, y: 450 },
};

/** Where each seat's revealed rows are drawn (top-left of the 3-row block). */
const HANDS: Record<Spot, { x: number; y: number }> = {
  bottom: { x: 680, y: 520 },
  left: { x: 230, y: 330 },
  top: { x: 680, y: 160 },
  right: { x: 1130, y: 330 },
};

/** The oval poker table art (exported from the web's PokerTable). */
export function PokerTable() {
  return <Art name="table" width={1600} style={StyleSheet.absoluteFill} animate={false} />;
}

export function SeatBadge({ spot, name, avatar, userId, sub, active, banker }: { spot: Spot; name: string; avatar?: string | null; userId?: number | null; sub?: string; active?: boolean; banker?: boolean }) {
  const p = SEAT[spot];
  return (
    <View style={[styles.seat, { left: p.x - 90, top: p.y - 70 }]} pointerEvents="none">
      <View style={active ? styles.activeRing : undefined}>
        <Avatar avatar={avatar} userId={userId} size={104} />
      </View>
      {banker && (
        <View style={styles.bankerTag}>
          <Text style={styles.bankerText}>BANKER</Text>
        </View>
      )}
      <View style={styles.nameTag}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** A seat's revealed Front / Middle / Back, with hand names, foul and result. */
export function RevealedHand({ spot, rows, labels, foul, result }: { spot: Spot; rows: Partial<Record<Lane, string[]>>; labels?: Partial<Record<Lane, string | null>>; foul?: boolean; result?: ReactNode }) {
  const p = HANDS[spot];
  return (
    <View style={[styles.hand, { left: p.x, top: p.y }]} pointerEvents="none">
      {(['front', 'middle', 'back'] as Lane[]).map((l) => (
        <View key={l} style={styles.handRow}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {(rows[l] ?? []).map((c, i) => (
              <PlayingCard key={i} code={c} w={44} />
            ))}
          </View>
          {labels?.[l] ? <Text style={styles.handLabel}>{labels[l]}</Text> : null}
        </View>
      ))}
      {foul && <Text style={styles.foul}>MISARRANGED</Text>}
      {result}
    </View>
  );
}

/** Center banner (round status, results). */
export function Banner({ children, tone = 'dark' }: { children: ReactNode; tone?: 'dark' | 'win' | 'lose' }) {
  const colors = tone === 'win' ? (['#1f8a3a', '#0b5e22'] as const) : tone === 'lose' ? (['#b3141b', '#5a0609'] as const) : (['#3a0a3a', '#1a0420'] as const);
  return (
    <LinearGradient colors={colors} style={styles.banner}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  seat: { position: 'absolute', width: 180, alignItems: 'center' },
  activeRing: { borderRadius: 70, borderWidth: 5, borderColor: '#4ee36b', padding: 2 },
  nameTag: { marginTop: 4, backgroundColor: 'rgba(26,4,32,0.85)', borderRadius: 14, borderWidth: 2, borderColor: '#ffc531', paddingHorizontal: 12, paddingVertical: 2, alignItems: 'center', maxWidth: 200 },
  name: { fontFamily: font.display, fontSize: 24, color: '#fff' },
  sub: { fontFamily: font.bodyHeavy, fontSize: 18, color: '#ffe14d' },
  bankerTag: { position: 'absolute', top: -14, backgroundColor: '#ffc531', borderRadius: 10, paddingHorizontal: 10, borderWidth: 2, borderColor: '#7a3e00' },
  bankerText: { fontFamily: font.display, fontSize: 18, color: '#5a2600' },
  hand: { position: 'absolute', width: 250, gap: 4 },
  handRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  handLabel: { fontFamily: font.bodyHeavy, fontSize: 16, color: '#ffe14d', flexShrink: 1 },
  foul: { fontFamily: font.display, fontSize: 20, color: '#fff', backgroundColor: '#d81e3c', alignSelf: 'flex-start', paddingHorizontal: 10, borderRadius: 10 },
  banner: { alignSelf: 'center', paddingHorizontal: 36, paddingVertical: 14, borderRadius: 30, borderWidth: 4, borderColor: '#ffc531', alignItems: 'center', gap: 6 },
});
