'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Coin, GameButton } from '@/components/game';
import { IconShield, IconTrophy } from '@/components/icons';
import { CardFan } from '@/components/PlayingCard';
import { storage } from '@/lib/storage';

const SLIDES = [
  { art: <CardFan cards={['AS', 'AH', 'KD', 'KC', 'QS']} size="md" spread={10} />, title: '13 cards, 3 hands', text: 'Arrange your cards into a Front (3), Middle (5) and Back (5). The Back must be your strongest.' },
  { art: <IconTrophy className="h-24 w-24 text-gold-400 drop-shadow-[0_6px_0_#9a5b03]" />, title: 'Beat every rival', text: 'Each hand is compared with the same hand of all three opponents: +1 win, −1 loss, 0 tie.' },
  { art: <div className="flex -space-x-4"><Coin size={72} /><Coin size={72} className="-translate-y-3" /><Coin size={72} /></div>, title: 'Free-play coins', text: 'Play with Virtual Coins from your agent or the daily bonus. VC is never redeemable for money.' },
  { art: <IconShield className="h-24 w-24 text-mint-400 drop-shadow-[0_6px_0_#06724c]" />, title: 'Provably fair', text: 'Every deck is locked in before the deal and revealed afterwards so anyone can verify it.' },
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
    <div className="game-bg safe-top safe-bottom flex min-h-dvh flex-col px-6 text-white">
      <button onClick={finish} className="ml-auto mt-4 h-10 rounded-full bg-white/10 px-4 font-display text-sm font-bold text-white/80">
        Skip
      </button>
      <div key={index} className="animate-pop flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-8 flex h-40 items-center justify-center">{slide.art}</div>
        <h1 className="mb-3 font-display text-3xl font-black">{slide.title}</h1>
        <p className="max-w-xs text-white/75">{slide.text}</p>
      </div>
      <div className="mb-6 flex justify-center gap-2">
        {SLIDES.map((_, i) => (
          <span key={i} className={`h-2.5 rounded-full transition-all ${i === index ? 'w-8 bg-gold-400' : 'w-2.5 bg-white/25'}`} />
        ))}
      </div>
      <GameButton size="lg" className="mb-8 w-full" onClick={() => (last ? finish() : setIndex(index + 1))}>
        {last ? "LET'S PLAY" : 'NEXT'}
      </GameButton>
    </div>
  );
}
