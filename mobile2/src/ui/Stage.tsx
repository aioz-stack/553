import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { MotionClock, Scene } from './Art';

export const STAGE_W = 1600;
export const STAGE_H = 900;

const ScaleContext = createContext(1);
/** Screen points per design unit on this phone. */
export const useStageScale = () => useContext(ScaleContext);

/**
 * The fixed 1600×900 design canvas (same coordinates as the web app), scaled to fit the screen.
 * The scene fills the whole screen behind it, so phones wider or taller than 16:9 never show a
 * seam. Dialogs are rendered with <Overlay>, which also covers the whole screen.
 */
export function Stage({ scene, children, overlay }: { scene: string; children: ReactNode; overlay?: ReactNode }) {
  const { width: W, height: H } = useWindowDimensions();
  // Leave room for rounded corners / camera cut-outs on the long edges.
  const s = Math.min((W - 24) / STAGE_W, (H - 8) / STAGE_H);
  return (
    <MotionClock>
      <View style={styles.root}>
        <Scene name={scene} width={W} height={H} />
        <ScaleContext.Provider value={s}>
          <View
            style={{
              position: 'absolute',
              width: STAGE_W,
              height: STAGE_H,
              left: (W - STAGE_W) / 2,
              top: (H - STAGE_H) / 2,
              transform: [{ scale: s }],
            }}
          >
            {children}
          </View>
          {overlay}
        </ScaleContext.Provider>
      </View>
    </MotionClock>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#170a3a', overflow: 'hidden' },
});
