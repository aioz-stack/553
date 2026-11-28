'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const STAGE_W = 1600;
export const STAGE_H = 900;

/** Maps a screen (client) point to stage coordinates, accounting for scale and rotation. */
const StageContext = createContext<(clientX: number, clientY: number) => { x: number; y: number }>((x, y) => ({ x, y }));
export const useToStage = () => useContext(StageContext);

/**
 * Fixed 1600×900 design canvas scaled to fit the screen (like a game canvas),
 * so the landscape home keeps its composition on every phone. The backdrop
 * fills the whole screen behind it. When the screen is portrait (a browser
 * that cannot lock orientation) the whole scene is rotated 90° so it still
 * reads as landscape; the native app locks landscape on the home screen.
 */
export default function LandscapeStage({ background, children, className = '' }: { background: ReactNode; children: ReactNode; className?: string }) {
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let frame: number | null = null;
    const measure = () => setVp((current) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      return current?.w === w && current.h === h ? current : { w, h };
    });
    measure();
    const update = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (!vp) {
    return <div className="fixed inset-0 bg-[#0d0524]" />;
  }

  const portrait = vp.h > vp.w;
  const W = portrait ? vp.h : vp.w;
  const H = portrait ? vp.w : vp.h;
  // Leave room for notches / rounded corners on the long edges.
  const scale = Math.min((W - 24) / STAGE_W, (H - 8) / STAGE_H);
  const toStage = (cx: number, cy: number) => {
    const dx = cx - vp.w / 2;
    const dy = cy - vp.h / 2;
    // Portrait: the scene is rotated 90° clockwise, so undo that rotation.
    return portrait ? { x: dy / scale + STAGE_W / 2, y: -dx / scale + STAGE_H / 2 } : { x: dx / scale + STAGE_W / 2, y: dy / scale + STAGE_H / 2 };
  };

  return (
    <div className={`fixed inset-0 overflow-hidden bg-[#0d0524] ${className}`}>
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: W, height: H, transform: `translate(-50%, -50%) rotate(${portrait ? 90 : 0}deg)` }}
      >
        <div className="absolute inset-0">{background}</div>
        <div
          className="absolute left-1/2 top-1/2"
          style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <StageContext.Provider value={toStage}>{children}</StageContext.Provider>
        </div>
      </div>
    </div>
  );
}
