'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { storage } from '@/lib/storage';

const SLIDES = [
  { icon: '♠♥♦♣', title: 'Thirteen cards, three hands', text: 'Arrange your cards into a Front (3), Middle (5) and Back (5). Back must be the strongest.' },
  { icon: '⚔️', title: 'Beat every opponent', text: 'Each hand is compared with the same hand of the other three players: +1 win, −1 loss, 0 tie.' },
  { icon: '🪙', title: 'Free-play Virtual Coins', text: 'Play with VC credited by your agent or the free daily reward. VC is never redeemable for money.' },
  { icon: '🔒', title: 'Provably fair', text: 'Every deck is committed before the deal and the seed is revealed after the game so anyone can verify it.' },
];

export default function Onboarding() {
  const [index, setIndex] = useState(0);
  const router = useRouter();
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  const finish = async () => {
    await storage.set('pusoy.onboarded', '1');
    router.replace('/login/');
  };

  return (
    <div className="safe-top safe-bottom flex min-h-dvh flex-col bg-brand-950 px-6 text-white">
      <button onClick={finish} className="ml-auto mt-4 h-10 text-sm text-white/60">
        Skip
      </button>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-8 text-6xl">{slide.icon}</div>
        <h1 className="mb-3 text-2xl font-bold">{slide.title}</h1>
        <p className="max-w-xs text-white/70">{slide.text}</p>
      </div>
      <div className="mb-6 flex justify-center gap-2">
        {SLIDES.map((_, i) => (
          <span key={i} className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-brand-400' : 'w-2 bg-white/30'}`} />
        ))}
      </div>
      <Button className="mb-8 w-full" onClick={() => (last ? finish() : setIndex(index + 1))}>
        {last ? 'Get started' : 'Next'}
      </Button>
    </div>
  );
}
