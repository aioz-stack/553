import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useMotion } from '@/lib/motion';

/** Gentle float (the web's lx-bob / lx-bob-slow) for whole HTML-level elements. */
export function Bob({ children, amount = 10, seconds = 5, delay = 0, style }: { children: ReactNode; amount?: number; seconds?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  const y = useSharedValue(0);
  const [quality] = useMotion();
  useEffect(() => {
    if (quality === 'low') {
      y.value = 0;
      return;
    }
    y.value = withDelay(delay * 1000, withRepeat(withTiming(-amount, { duration: (seconds * 1000) / 2, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [quality, amount, seconds, delay, y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}
