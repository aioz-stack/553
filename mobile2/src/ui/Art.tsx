import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { createContext, memo, useContext, useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { ART } from '@/art/generated';
import type { ArtLayer } from '@/art/types';
import { useMotion } from '@/lib/motion';

/**
 * Native replay of the web app's art. Each piece was exported from the web components
 * (scripts/art/exporter.js) as still layers + moving parts in paint order; here every moving part
 * is an image whose transform/opacity is driven on the UI thread from one shared clock. Nothing is
 * ever redrawn — the GPU only moves textures — so it stays smooth on any phone.
 */

type Pose = { tx?: number; ty?: number; tyP?: number; rot?: number; s?: number; sx?: number; sy?: number; op?: number };
type Stop = [number, Pose];

/** The web's keyframes (globals.css), as stops. Translations are in the layer's local units. */
const KEYFRAMES: Record<string, Stop[]> = {
  'lx-breathe': [[0, { s: 1, op: 0.8 }], [0.5, { s: 1.1, op: 1 }], [1, { s: 1, op: 0.8 }]],
  'lx-drift': [[0, { tx: 0 }], [0.5, { tx: 70 }], [1, { tx: 0 }]],
  'lx-sea': [[0, { tx: 0 }], [0.5, { tx: -26 }], [1, { tx: 0 }]],
  'lx-palm': [[0, { rot: -1.5 }], [0.5, { rot: 1.5 }], [1, { rot: -1.5 }]],
  'lx-twinkle': [[0, { s: 0.35, rot: 0, op: 0.2 }], [0.5, { s: 1.15, rot: 45, op: 1 }], [1, { s: 0.35, rot: 0, op: 0.2 }]],
  'lx-spring-icon': [[0, {}], [0.09, { tyP: -0.14, sx: 0.94, sy: 1.08 }], [0.18, { sx: 1.1, sy: 0.88 }], [0.25, { tyP: -0.05, sx: 0.98, sy: 1.03 }], [0.32, { sx: 1.03, sy: 0.97 }], [0.4, {}], [1, {}]],
  'lx-spring': [[0, {}], [0.09, { tyP: -0.04, sx: 0.985, sy: 1.02 }], [0.18, { sx: 1.025, sy: 0.97 }], [0.25, { tyP: -0.012, sx: 0.995, sy: 1.008 }], [0.32, { sx: 1.008, sy: 0.993 }], [0.4, {}], [1, {}]],
  'tb-swing': [[0, { rot: -3 }], [0.5, { rot: 3 }], [1, { rot: -3 }]],
  'tb-sway-soft': [[0, { rot: -4 }], [0.5, { rot: 4 }], [1, { rot: -4 }]],
  'lx-sway': [[0, { rot: -4 }], [0.5, { rot: 4 }], [1, { rot: -4 }]],
  'lx-bob': [[0, { ty: 0 }], [0.5, { ty: -10 }], [1, { ty: 0 }]],
  'lx-coin': [[0, {}], [0.7, {}], [0.8, { ty: -16, sx: 0.96, sy: 1.06 }], [0.9, { ty: 0, sx: 1.06, sy: 0.92 }], [1, {}]],
  'lx-spin': [[0, { rot: 0 }], [1, { rot: 360 }]],
  'lx-nudge': [[0, { tx: 0 }], [0.5, { tx: 10 }], [1, { tx: 0 }]],
  'lx-glow': [[0, { op: 0.8 }], [0.5, { op: 1 }], [1, { op: 0.8 }]],
  'lx-glint': [[0, { rot: -6, s: 1 }], [0.5, { rot: 6, s: 1.08 }], [1, { rot: -6, s: 1 }]],
  'tb-petal': [[0, { tx: 0, ty: -40, rot: 0, op: 0 }], [0.1, { tx: 12, ty: -10, rot: 32, op: 0.9 }], [1, { tx: 120, ty: 260, rot: 320, op: 0 }]],
};

const ease = (x: number, timing: number) => {
  'worklet';
  if (timing === 1) return x; // linear
  if (timing === 2) return 1 - Math.pow(1 - x, 3) * (1 - 1.6 * x); // springy cubic-bezier(.3,1.4,…)
  return 0.5 - 0.5 * Math.cos(Math.PI * x); // ease-in-out
};

function poseAt(stops: Stop[], p: number, timing: number) {
  'worklet';
  let i = 0;
  while (i < stops.length - 2 && p > stops[i + 1][0]) i++;
  const [o0, a] = stops[i];
  const [o1, b] = stops[i + 1];
  const k = ease(o1 > o0 ? Math.min(1, Math.max(0, (p - o0) / (o1 - o0))) : 0, timing);
  const mix = (x: number | undefined, y: number | undefined, d: number) => {
    const u = x ?? d;
    const v = y ?? d;
    return u + (v - u) * k;
  };
  return {
    tx: mix(a.tx, b.tx, 0),
    ty: mix(a.ty, b.ty, 0),
    tyP: mix(a.tyP, b.tyP, 0),
    rot: mix(a.rot, b.rot, 0),
    sx: mix(a.sx ?? a.s, b.sx ?? b.s, 1),
    sy: mix(a.sy ?? a.s, b.sy ?? b.s, 1),
    op: mix(a.op, b.op, 1),
  };
}

/** One UI-thread clock (seconds) per screen; it stops while the screen is hidden or motion is off. */
const ClockContext = createContext<SharedValue<number> | null>(null);

export function MotionClock({ children }: { children: ReactNode }) {
  const t = useSharedValue(0);
  const focused = useIsFocused();
  const [quality] = useMotion();
  const cb = useFrameCallback((f) => {
    t.value += (f.timeSincePreviousFrame ?? 16) / 1000;
  }, false);
  useEffect(() => {
    cb.setActive(focused && quality !== 'low');
  }, [cb, focused, quality]);
  return <ClockContext.Provider value={t}>{children}</ClockContext.Provider>;
}

const AnimLayer = memo(function AnimLayer({ l, scale, clock }: { l: ArtLayer; scale: number; clock: SharedValue<number> }) {
  const stops = KEYFRAMES[l.anim ?? ''];
  const timing = l.timing === 'linear' ? 1 : (l.timing ?? '').startsWith('cubic-bezier(0.3') ? 2 : 0;
  const dur = l.duration && l.duration > 0 ? l.duration : 1;
  const delay = l.delay ?? 0;
  const unit = (l.unit ?? 1) * scale;
  const dir = l.flip ? -1 : 1;
  const h = l.h * scale;
  const style = useAnimatedStyle(() => {
    if (!stops) return {};
    const raw = (clock.value - delay) / dur;
    const p = raw - Math.floor(raw);
    const q = poseAt(stops, p, timing);
    return {
      opacity: q.op,
      transform: [{ translateX: q.tx * unit * dir }, { translateY: q.ty * unit + q.tyP * h }, { rotate: `${q.rot * dir}deg` }, { scaleX: q.sx }, { scaleY: q.sy }],
    };
  });
  const origin = l.pivotX !== undefined && l.pivotY !== undefined ? { transformOrigin: [(l.pivotX - l.x) * scale, (l.pivotY - l.y) * scale, 0] } : null;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: l.x * scale, top: l.y * scale, width: l.w * scale, height: l.h * scale }, origin as ViewStyle, style]}>
      <Image source={l.src} style={StyleSheet.absoluteFill} contentFit="fill" />
    </Animated.View>
  );
});

/**
 * An exported art piece at `width` screen units wide (height follows its aspect ratio).
 * `animate={false}` shows the resting frame only.
 */
export const Art = memo(function Art({ name, width, style, animate = true }: { name: string; width: number; style?: StyleProp<ViewStyle>; animate?: boolean }) {
  const piece = ART[name];
  const clock = useContext(ClockContext);
  if (!piece) return null;
  const scale = width / piece.width;
  return (
    <View pointerEvents="none" style={[{ width, height: piece.height * scale }, style]}>
      {piece.layers.map((l, i) =>
        l.kind === 'anim' && animate && clock ? (
          <AnimLayer key={i} l={l} scale={scale} clock={clock} />
        ) : (
          <Image key={i} source={l.src} contentFit="fill" style={{ position: 'absolute', left: l.x * scale, top: l.y * scale, width: l.w * scale, height: l.h * scale }} />
        ),
      )}
    </View>
  );
});

/** A full-screen scene (beach / lantern room) that covers the screen like CSS `slice`. */
export function Scene({ name, width, height }: { name: string; width: number; height: number }) {
  const piece = ART[name];
  if (!piece) return null;
  const s = Math.max(width / piece.width, height / piece.height);
  const w = piece.width * s;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Art name={name} width={w} style={{ position: 'absolute', left: (width - w) / 2, top: (height - piece.height * s) / 2 }} />
    </View>
  );
}
