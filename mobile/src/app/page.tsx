'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CardFan } from '@/components/PlayingCard';
import { useAuth } from '@/lib/auth';
import { RESUME_KEY } from '@/lib/nativeBoot';
import { storage } from '@/lib/storage';

/**
 * Splash: decides where to go (onboarding → login → home).
 */
export default function Splash() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) {
      return;
    }

    // The native app reloaded on an inner page (see lib/nativeBoot): go straight back to it.
    let resume: string | null = null;
    try {
      resume = sessionStorage.getItem(RESUME_KEY);
      sessionStorage.removeItem(RESUME_KEY);
    } catch {
      // storage unavailable
    }
    if (resume && user) {
      router.replace(resume);
      return;
    }

    const timer = setTimeout(async () => {
      if (user) {
        router.replace('/home/');
      } else if (await storage.get('pusoy.onboarded')) {
        router.replace('/login/');
      } else {
        router.replace('/onboarding/');
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [ready, user, router]);

  return (
    <div className="game-bg safe-top flex min-h-dvh flex-col items-center justify-center text-white">
      <div className="animate-pop">
        <CardFan cards={['AS', 'KH', 'QD', 'JC', 'TS']} size="md" spread={12} />
      </div>
      <h1 className="animate-pop mt-4 font-display text-6xl font-black tracking-tight">
        <span className="text-gold">PUSOY</span> <span className="drop-shadow-[0_4px_0_rgb(0_0_0/0.4)]">13</span>
      </h1>
      <p className="mt-2 font-display text-sm font-bold uppercase tracking-[0.3em] text-white/60">Chinese Poker</p>
      <div className="mt-10 h-2 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="shine h-full w-full rounded-full bg-gradient-to-r from-gold-300 to-gold-600" />
      </div>
    </div>
  );
}
