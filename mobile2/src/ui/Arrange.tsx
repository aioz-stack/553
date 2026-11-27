import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { CandyButton, PlayingCard, Squish } from './kit';
import { font, GOLD_RIM } from './theme';

export type Lane = 'front' | 'middle' | 'back';
export type Rows = Record<Lane, string[]>;
export const LANES: Lane[] = ['front', 'middle', 'back'];
const SIZE: Record<Lane, number> = { front: 3, middle: 5, back: 5 };
const RANKS = '23456789TJQKA';

/** Your 13 cards straight into Front / Middle / Back in dealt order (nothing is arranged for you). */
export function dealtRows(cards: string[]): Rows {
  return { front: cards.slice(0, 3), middle: cards.slice(3, 8), back: cards.slice(8, 13) };
}

function sortCards(cards: string[], by: 'rank' | 'suit'): string[] {
  return [...cards].sort((a, b) => {
    const r = RANKS.indexOf(b[0]) - RANKS.indexOf(a[0]);
    const s = 'SHDC'.indexOf(a[1]) - 'SHDC'.indexOf(b[1]);
    return by === 'rank' ? r || s : s || r;
  });
}

type Preview = { labels: Record<Lane, string | null>; is_foul: boolean };

/**
 * Arrange your hand: tap a card, then another, to swap them. Live lane names (and a misarranged
 * warning) come from the server's preview — the app never scores anything itself.
 * Rendered in stage coordinates over the table.
 */
export function ArrangePanel({
  cards,
  initial,
  previewPath,
  onSubmit,
  onChange,
  busy,
  secondsLeft,
  extra,
}: {
  cards: string[];
  initial?: Rows | null;
  previewPath: string;
  onSubmit: (rows: Rows) => void;
  onChange?: (rows: Rows) => void;
  busy?: boolean;
  secondsLeft?: number | null;
  extra?: React.ReactNode;
}) {
  const [rows, setRows] = useState<Rows>(() => (initial && initial.front.length + initial.middle.length + initial.back.length === 13 ? initial : dealtRows(cards)));
  const [picked, setPicked] = useState<{ lane: Lane; i: number } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const seq = useRef(0);

  // Live lane names from the server (debounced; stale answers are dropped).
  useEffect(() => {
    onChange?.(rows);
    const n = ++seq.current;
    const t = setTimeout(() => {
      api<{ data: Preview }>(previewPath, { method: 'POST', body: rows })
        .then((r) => n === seq.current && setPreview(r.data))
        .catch(() => undefined);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, previewPath]);

  const tap = (lane: Lane, i: number) => {
    if (!picked) {
      setPicked({ lane, i });
      return;
    }
    if (picked.lane === lane && picked.i === i) {
      setPicked(null);
      return;
    }
    setRows((r) => {
      const next: Rows = { front: [...r.front], middle: [...r.middle], back: [...r.back] };
      const a = next[picked.lane][picked.i];
      next[picked.lane][picked.i] = next[lane][i];
      next[lane][i] = a;
      return next;
    });
    setPicked(null);
  };

  const sortAll = (by: 'rank' | 'suit') => {
    // Strongest cards to the back: the sorted hand fills Back, then Middle, then Front.
    const s = sortCards([...rows.front, ...rows.middle, ...rows.back], by);
    setRows({ back: s.slice(0, 5), middle: s.slice(5, 10), front: s.slice(10, 13) });
    setPicked(null);
  };

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={GOLD_RIM} style={styles.rim}>
        <LinearGradient colors={['#1f8a3a', '#0b5e22']} style={styles.felt}>
          {LANES.map((lane) => {
            const label = preview?.labels?.[lane];
            const ok = !!preview && !preview.is_foul;
            return (
              <View key={lane} style={styles.laneRow}>
                <View style={styles.tagCol}>
                  <View style={[styles.mark, { backgroundColor: !preview ? '#6b6b7a' : ok ? '#14a046' : '#d81e3c' }]}>
                    <Text style={styles.markText}>{!preview ? '…' : ok ? '✓' : '✕'}</Text>
                  </View>
                  <View style={styles.tag}>
                    <Text style={styles.tagTitle}>
                      {lane.toUpperCase()} {rows[lane].length}/{SIZE[lane]}
                    </Text>
                    <Text style={styles.tagSub}>{label ?? ' '}</Text>
                  </View>
                </View>
                <View style={styles.lane}>
                  {rows[lane].map((c, i) => (
                    <PlayingCard key={`${lane}${i}${c}`} code={c} w={104} selected={picked?.lane === lane && picked.i === i} onPress={() => tap(lane, i)} />
                  ))}
                </View>
              </View>
            );
          })}
          <Text style={styles.hint}>{preview?.is_foul ? 'Misarranged: Back must be ≥ Middle ≥ Front.' : 'Tap a card, then tap another card to swap them.'}</Text>
        </LinearGradient>
      </LinearGradient>

      <View style={styles.side}>
        {secondsLeft !== null && secondsLeft !== undefined && (
          <View style={styles.timer}>
            <Text style={styles.timerText}>{secondsLeft}s</Text>
          </View>
        )}
        <Squish label="Swap middle and back" onPress={() => setRows((r) => ({ ...r, middle: r.back, back: r.middle }))} style={styles.round}>
          <LinearGradient colors={['#e0262f', '#7a0a12']} style={styles.roundFace}>
            <Text style={styles.roundText}>⇅</Text>
          </LinearGradient>
        </Squish>
        <CandyButton title="Rank" tone="dark" w={170} h={62} size={26} onPress={() => sortAll('rank')} />
        <CandyButton title="Suit" tone="dark" w={170} h={62} size={26} onPress={() => sortAll('suit')} />
        {extra}
        <CandyButton title={busy ? '…' : 'SUBMIT'} tone="gold" w={260} h={92} size={40} disabled={busy} onPress={() => onSubmit(rows)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 150, top: 40, width: 1300, height: 820, flexDirection: 'row', gap: 24 },
  rim: { width: 960, borderRadius: 44, padding: 9 },
  felt: { flex: 1, borderRadius: 36, paddingVertical: 26, paddingHorizontal: 26, justifyContent: 'space-between' },
  laneRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  tagCol: { width: 190, alignItems: 'center', gap: 8 },
  mark: { width: 54, height: 54, borderRadius: 27, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: font.display, fontSize: 28, color: '#fff', lineHeight: 34 },
  tag: { backgroundColor: '#3a0a0a', borderRadius: 14, borderWidth: 3, borderColor: '#ffc531', paddingVertical: 4, paddingHorizontal: 12, alignItems: 'center' },
  tagTitle: { fontFamily: font.display, fontSize: 22, color: '#fff' },
  tagSub: { fontFamily: font.bodyHeavy, fontSize: 18, color: '#ffe14d' },
  lane: { flex: 1, flexDirection: 'row', gap: 10, padding: 10, borderRadius: 22, borderWidth: 4, borderColor: '#5be07a', backgroundColor: 'rgba(0,0,0,0.15)', minHeight: 170 },
  hint: { fontFamily: font.bodyHeavy, fontSize: 22, color: '#e9ffe9', textAlign: 'center' },
  side: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  timer: { width: 120, height: 120, borderRadius: 60, borderWidth: 6, borderColor: '#ffc531', backgroundColor: '#3a0a0a', alignItems: 'center', justifyContent: 'center' },
  timerText: { fontFamily: font.display, fontSize: 42, color: '#ffe14d' },
  round: { width: 100, height: 100 },
  roundFace: { flex: 1, borderRadius: 50, borderWidth: 5, borderColor: '#ffc531', alignItems: 'center', justifyContent: 'center' },
  roundText: { fontFamily: font.display, fontSize: 48, color: '#fff', lineHeight: 56 },
});
