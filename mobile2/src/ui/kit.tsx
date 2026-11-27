import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import { ART } from '@/art/generated';
import { AVATARS, avatarFor } from '@/lib/avatars';
import { STAGE_H, STAGE_W, useStageScale } from './Stage';
import { color, font, GOLD_RIM } from './theme';

/* ------------------------------------------------------------------ text */

/**
 * Chunky display text with a dark outline (the web's candy text for dynamic strings such as names
 * and balances). The outline is drawn with offset copies — cheap native text, no images.
 */
export function GameText({ children, size = 32, fill = color.white, stroke = '#3a2210', strokeWidth, style, numberOfLines }: { children: ReactNode; size?: number; fill?: string; stroke?: string | null; strokeWidth?: number; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const w = strokeWidth ?? Math.max(2, Math.round(size * 0.08));
  const base: TextStyle = { fontFamily: font.display, fontSize: size, lineHeight: size * 1.25, includeFontPadding: false };
  const offsets = stroke ? [[-w, 0], [w, 0], [0, -w], [0, w], [-w * 0.7, -w * 0.7], [w * 0.7, -w * 0.7], [-w * 0.7, w * 0.7], [w * 0.7, w * 0.7]] : [];
  return (
    <View style={style as StyleProp<ViewStyle>}>
      {offsets.map(([x, y], i) => (
        <Text key={i} numberOfLines={numberOfLines} style={[base, { color: stroke!, position: 'absolute', left: x, top: y + w * 0.5 }]} aria-hidden>
          {children}
        </Text>
      ))}
      <Text numberOfLines={numberOfLines} style={[base, { color: fill }, style as StyleProp<TextStyle>, { position: 'relative', margin: 0, padding: 0 }]}>
        {children}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ press */

/** A pressable that squishes down and springs back (the web's lx-tile press), with a haptic tap. */
export function Squish({ onPress, children, style, disabled, label }: { onPress?: () => void; children: ReactNode; style?: StyleProp<ViewStyle>; disabled?: boolean; label?: string }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPressIn={() => {
        s.value = withTiming(0.95, { duration: 80 });
      }}
      onPressOut={() => {
        s.value = withSpring(1, { damping: 8, stiffness: 260 });
      }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      style={style}
    >
      <Animated.View style={[{ flex: 1 }, a, disabled && { opacity: 0.55 }]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ tile */

/** Glossy home tile: gold rim, radial-ish face, corner studs, gloss highlight. */
export function Tile({ x, y, w, h, from, to, label, onPress, children }: { x: number; y: number; w: number; h: number; from: string; to: string; label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Squish label={label} onPress={onPress} style={{ position: 'absolute', left: x, top: y, width: w, height: h }}>
      <LinearGradient colors={GOLD_RIM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tileRim, { borderRadius: 44 }]}>
        <LinearGradient colors={[from, to]} start={{ x: 0.5, y: 0.1 }} end={{ x: 0.5, y: 1 }} style={styles.tileFace}>
          <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
          {children}
        </LinearGradient>
        {[{ left: 14, top: 14 }, { right: 14, top: 14 }, { left: 14, bottom: 14 }, { right: 14, bottom: 14 }].map((p, i) => (
          <LinearGradient key={i} colors={['#fffbe0', '#e09000']} style={[styles.stud, p]} />
        ))}
      </LinearGradient>
    </Squish>
  );
}

/* ------------------------------------------------------------------ buttons */

const TONES = {
  gold: { colors: ['#ffe36a', '#f5ad14'] as const, text: '#5a2600', lip: '#a86204' },
  green: { colors: ['#5ef08a', '#14a046'] as const, text: '#ffffff', lip: '#0b5e22' },
  purple: { colors: ['#b06bff', '#6a1fd8'] as const, text: '#ffffff', lip: '#3a0f7a' },
  red: { colors: ['#ff6b5c', '#c0101a'] as const, text: '#ffffff', lip: '#6b0606' },
  dark: { colors: ['#4a2a6a', '#22104f'] as const, text: '#ffffff', lip: '#0d0524' },
};

export function CandyButton({ title, onPress, tone = 'gold', w = 320, h = 86, size = 34, disabled, style }: { title: string; onPress: () => void; tone?: keyof typeof TONES; w?: number; h?: number; size?: number; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  return (
    <Squish label={title} onPress={onPress} disabled={disabled} style={[{ width: w, height: h }, style]}>
      <View style={[styles.btnLip, { backgroundColor: t.lip, borderRadius: h / 2 }]}>
        <LinearGradient colors={t.colors} style={[styles.btnFace, { borderRadius: h / 2 }]}>
          <LinearGradient colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']} style={[styles.btnGloss, { borderRadius: h / 2 }]} pointerEvents="none" />
          <Text style={{ fontFamily: font.display, fontSize: size, color: t.text, includeFontPadding: false }}>{title}</Text>
        </LinearGradient>
      </View>
    </Squish>
  );
}

/* ------------------------------------------------------------------ wallet pill */

export const WALLET_THEME = {
  gold: { label: 'Gold', frame: ['#fff3a0', '#ffc531', '#c27a04'], body: ['#6b4300', '#2a1800'], text: '#ffe14d', icon: 'icon-gold' },
  chips: { label: 'Chips', frame: ['#ffb3b3', '#ff4a4a', '#8a0a10'], body: ['#7a0a12', '#2e0306'], text: '#ffb3bd', icon: 'icon-chips' },
  keys: { label: 'Keys', frame: ['#e9c8ff', '#a24dff', '#3a0b7a'], body: ['#3a0b7a', '#160330'], text: '#e2c4ff', icon: 'icon-keys' },
} as const;

/** A wallet pill (Gold / Chips / Keys) — display only; the server owns every balance. */
export function Pill({ kind, value, w = 356, onPlus }: { kind: keyof typeof WALLET_THEME; value: string; w?: number; onPlus?: () => void }) {
  const t = WALLET_THEME[kind];
  const label = t.label;
  return (
    <LinearGradient colors={t.frame} style={[styles.pill, { width: w }]}>
      <LinearGradient colors={t.body} style={styles.pillBody}>
        <Art name={t.icon} size={48} />
        <Text style={[styles.pillLabel, { color: t.text }]}>{label}</Text>
        <Text style={styles.pillValue}>{value}</Text>
        {onPlus && (
          <Squish label={`Buy ${label}`} onPress={onPlus} style={styles.plus}>
            <LinearGradient colors={['#5ef08a', '#14a046']} style={styles.plusFace}>
              <Text style={styles.plusText}>+</Text>
            </LinearGradient>
          </Squish>
        )}
      </LinearGradient>
    </LinearGradient>
  );
}

/** A still exported art piece, `size` wide. */
function Art({ name, size }: { name: string; size: number }) {
  const p = ART[name];
  if (!p) return null;
  return <Image source={p.layers[0].src} style={{ width: size, height: (p.height / p.width) * size }} contentFit="contain" />;
}

/* ------------------------------------------------------------------ avatar */

export function Avatar({ avatar, userId, size = 120, ring = true }: { avatar?: string | null; userId?: number | null; size?: number; ring?: boolean }) {
  const img = <Image source={AVATARS[avatarFor(avatar, userId)]} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  if (!ring) return img;
  return (
    <LinearGradient colors={GOLD_RIM} style={{ padding: size * 0.055, borderRadius: size, shadowColor: '#000', elevation: 6 }}>
      <View style={{ borderRadius: size, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', overflow: 'hidden' }}>{img}</View>
    </LinearGradient>
  );
}

/* ------------------------------------------------------------------ cards */

export const CARD_RATIO = 1.4;

/** A playing card from the exported 553 card art; lifts with a gold glow when selected. */
export function PlayingCard({ code, w = 96, selected, faceDown, onPress, style }: { code?: string | null; w?: number; selected?: boolean; faceDown?: boolean; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const src = ART[faceDown || !code ? 'cards/back' : `cards/${code}`]?.layers[0]?.src;
  const lift = useSharedValue(selected ? -18 : 0);
  useEffect(() => {
    lift.value = withSpring(selected ? -18 : 0, { damping: 12, stiffness: 300 });
  }, [selected, lift]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  const body = (
    <Animated.View style={[{ width: w, height: w * CARD_RATIO }, styles.card, selected && styles.cardOn, a, style]}>
      {src && <Image source={src} style={StyleSheet.absoluteFill} contentFit="fill" />}
    </Animated.View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={code ?? 'card'} hitSlop={4}>
      {body}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ overlay */

/**
 * A dialog over the whole screen: the dim covers every pixel (any aspect ratio); the content is
 * laid out in stage coordinates (1600×900) like the rest of the app.
 */
export function Overlay({ children, onClose, dim = 0.6 }: { children: ReactNode; onClose?: () => void; dim?: number }) {
  const { width: W, height: H } = useWindowDimensions();
  const s = useStageScale();
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(10,4,32,${dim})` }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View pointerEvents="box-none" style={{ position: 'absolute', width: STAGE_W, height: STAGE_H, left: (W - STAGE_W) / 2, top: (H - STAGE_H) / 2, transform: [{ scale: s }] }}>
        <Animated.View entering={ZoomIn.springify().damping(14)} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {children}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** A framed dialog panel (gold rim, deep purple body) for use inside <Overlay>. */
export function Panel({ x, y, w, h, title, onClose, children }: { x: number; y: number; w: number; h: number; title?: string; onClose?: () => void; children: ReactNode }) {
  return (
    <View style={{ position: 'absolute', left: x, top: y, width: w, height: h }}>
      <LinearGradient colors={GOLD_RIM} style={{ flex: 1, borderRadius: 46, padding: 10 }}>
        <LinearGradient colors={['#4b2398', '#22104f']} style={{ flex: 1, borderRadius: 38, padding: 36, paddingTop: title ? 70 : 36 }}>
          {children}
        </LinearGradient>
      </LinearGradient>
      {title && (
        <View style={styles.ribbon}>
          <LinearGradient colors={['#ff6fa5', '#b80f4f']} style={styles.ribbonFace}>
            <GameText size={46} stroke="#7a0a33">
              {title}
            </GameText>
          </LinearGradient>
        </View>
      )}
      {onClose && (
        <Squish label="Close" onPress={onClose} style={styles.close}>
          <LinearGradient colors={['#ff6b5c', '#c0101a']} style={styles.closeFace}>
            <Text style={styles.closeX}>✕</Text>
          </LinearGradient>
        </Squish>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ toast */

export function Toast({ toast }: { toast: { ok: boolean; text: string } | null }) {
  if (!toast) return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} pointerEvents="none" style={[styles.toast, { backgroundColor: toast.ok ? '#0f5a2c' : '#7a0a1f' }]}>
      <Text style={styles.toastText}>{toast.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tileRim: { flex: 1, padding: 11, shadowColor: '#000', elevation: 10 },
  tileFace: { flex: 1, borderRadius: 34, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gloss: { position: 'absolute', left: '5%', right: '5%', top: '3%', height: '40%', borderRadius: 999 },
  stud: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  btnLip: { flex: 1, paddingBottom: 7 },
  btnFace: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff3a0' },
  btnGloss: { position: 'absolute', left: 8, right: 8, top: 4, height: '46%' },
  pill: { height: 64, borderRadius: 32, padding: 4 },
  pillBody: { flex: 1, borderRadius: 28, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 14, gap: 10 },
  pillLabel: { fontFamily: font.bodyHeavy, fontSize: 16, color: '#ffe14d', letterSpacing: 1, textTransform: 'uppercase' },
  pillValue: { flex: 1, textAlign: 'right', fontFamily: font.display, fontSize: 30, color: '#fff', includeFontPadding: false },
  plus: { width: 46, height: 46, marginLeft: 6 },
  plusFace: { flex: 1, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#c8ffd6' },
  plusText: { fontFamily: font.display, fontSize: 32, color: '#fff', lineHeight: 38 },
  card: { borderRadius: 9, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, elevation: 5, backgroundColor: '#f7f1e3' },
  cardOn: { shadowColor: '#ffe14d', shadowOpacity: 1, shadowRadius: 14, elevation: 14 },
  ribbon: { position: 'absolute', top: -44, left: 0, right: 0, alignItems: 'center' },
  ribbonFace: { paddingHorizontal: 40, height: 92, borderRadius: 40, borderWidth: 5, borderColor: '#ffd34d', justifyContent: 'center' },
  close: { position: 'absolute', right: -30, top: -30, width: 96, height: 96 },
  closeFace: { flex: 1, borderRadius: 48, borderWidth: 6, borderColor: '#ffd34d', alignItems: 'center', justifyContent: 'center' },
  closeX: { fontFamily: font.display, fontSize: 44, color: '#fff', lineHeight: 52 },
  toast: { position: 'absolute', bottom: 24, alignSelf: 'center', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 18, borderWidth: 2, borderColor: '#ffd34d', maxWidth: '80%' },
  toastText: { fontFamily: font.bodyHeavy, fontSize: 15, color: '#fff', textAlign: 'center' },
});
