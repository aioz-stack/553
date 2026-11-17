'use client';

import type { ReactNode } from 'react';
import { CardFan } from './PlayingCard';

/** Shared backdrop + logo for splash/login/register. */
export default function AuthShell({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <div className="game-bg safe-top safe-bottom flex min-h-dvh flex-col px-6 text-white">
      <div className="suit-pattern pointer-events-none fixed inset-0" />
      <div className="relative mt-10 mb-6 text-center">
        <div className="animate-float">
          <CardFan cards={['AS', 'KH', 'QD', 'JC']} size="sm" spread={13} />
        </div>
        <h1 className="mt-2 font-display text-5xl font-black tracking-tight">
          <span className="text-gold">PUSOY</span> <span className="drop-shadow-[0_3px_0_rgb(0_0_0/0.4)]">13</span>
        </h1>
        {subtitle && <p className="mt-1 text-sm text-white/70">{subtitle}</p>}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}
