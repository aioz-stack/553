'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
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

    const timer = setTimeout(async () => {
      if (user) {
        router.replace('/home/');
      } else if (await storage.get('pusoy.onboarded')) {
        router.replace('/login/');
      } else {
        router.replace('/onboarding/');
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [ready, user, router]);

  return (
    <div className="safe-top flex min-h-dvh flex-col items-center justify-center bg-brand-950 text-white">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-brand-500 text-6xl shadow-2xl">♠</div>
      <h1 className="mt-6 text-3xl font-bold">
        Pusoy <span className="text-brand-300">13</span>
      </h1>
      <p className="mt-2 text-sm text-white/60">Chinese Poker for four</p>
    </div>
  );
}
