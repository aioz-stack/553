'use client';

import { useRef, useState } from 'react';
import { ApiError, errorText } from '@/lib/api';
import { claimGold, requestKey, walletChanged, type GoldWallet } from '@/lib/gold';
import { play } from '@/lib/sound';
import { CandyText, GoldCoins } from './HomeArt';

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * "Out of Gold!" — Single Player only (Home shows it when Single Player sends
 * you back with no Gold left, or when you tap Single Player while Out of Gold).
 *
 * CLAIM asks the server for the free Gold: it checks you are Out of Gold and
 * credits it straight into your Gold wallet, once per popup however often the
 * button is pressed. Nothing is credited until you press it. Drawn inside the
 * 1600 × 900 stage.
 */
export default function OutOfGoldPopup({ initial, onClose, onPlay }: { initial: GoldWallet; onClose: () => void; onPlay: () => void }) {
  const [state, setState] = useState(initial);
  const [step, setStep] = useState<'claim' | 'claimed'>('claim');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set synchronously, so clicks landing before the next render never send a second request.
  const inFlight = useRef(false);
  // One key per popup: a repeated or retried claim returns the same credit.
  const claimKey = useRef(requestKey());
  const amount = fmt(state.claim_amount);

  const claim = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await claimGold(claimKey.current);
      setState(r.data);
      setStep('claimed');
      setNotice(r.message);
      play('win');
      walletChanged();
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'not_eligible' ? e.message : errorText(e));
      play('lose');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 overlay-bleed z-40 flex items-center justify-center bg-black/65" onClick={step === 'claimed' ? onClose : undefined}>
      <div role="alertdialog" aria-label="Out of Gold" onClick={(e) => e.stopPropagation()} className="sp-pop lx-gold relative w-[860px] rounded-[48px] p-[12px] shadow-[0_14px_0_#7a3e00,0_30px_60px_rgb(0_0_0/0.6)]">
        {/* glowing rays behind the coins */}
        <div aria-hidden className="og-rays pointer-events-none absolute left-1/2 top-[40px] h-[460px] w-[460px] -translate-x-1/2 rounded-full" />
        <div className="relative overflow-hidden rounded-[38px] bg-gradient-to-b from-[#7a1fd1] via-[#4a0f96] to-[#24064f] px-[56px] pb-[44px] pt-[30px] text-center">
          <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[700px] -translate-x-1/2 rounded-full bg-white/15 blur-3xl" />

          <h2 className="relative flex justify-center">
            <CandyText text={step === 'claim' ? 'Out of Gold!' : 'Gold Claimed!'} width={700} height={110} size={86} />
          </h2>

          {/* reward illustration: a glowing pile of gold with sparkles */}
          <div aria-hidden className="relative mx-auto -mt-2 flex h-[190px] w-[420px] items-end justify-center">
            <span className="og-float absolute left-[46px] top-[60px]"><GoldCoins size={110} mark="G" /></span>
            <span className="og-float absolute left-[150px] top-[8px] [animation-delay:.4s]"><GoldCoins size={150} mark={step === 'claim' ? '?' : 'G'} /></span>
            <span className="og-float absolute right-[46px] top-[60px] [animation-delay:.8s]"><GoldCoins size={110} mark="G" /></span>
            {[[30, 20], [380, 30], [90, 150], [330, 150], [210, 0]].map(([x, y], i) => (
              <span key={i} className="og-twinkle absolute text-[34px] text-[#fff6b0]" style={{ left: x, top: y, animationDelay: `${i * 0.35}s` }}>
                ✦
              </span>
            ))}
          </div>

          {step === 'claim' ? (
            <>
              <p className="relative mx-auto mt-2 max-w-[680px] font-display text-[30px] font-black leading-snug text-white drop-shadow-[0_3px_0_rgb(0_0_0/0.45)]">
                Your Gold Wallet balance has reached zero! Don&apos;t worry! Claim your <span className="text-[#ffe14d]">FREE {amount} Gold</span> to replenish your wallet and continue enjoying Single Player!
              </p>
              <p className="relative mt-3 font-display text-[22px] font-bold text-white/70">
                Reward: <span className="text-[#ffe14d]">{amount} Gold</span> · Single Player only
              </p>
              <button
                type="button"
                onClick={claim}
                disabled={busy}
                className="og-claim lx-tile relative mx-auto mt-6 block rounded-full border-[6px] border-white bg-gradient-to-b from-[#7dff8a] via-[#2fd14a] to-[#108a2a] px-[54px] py-[18px] font-display text-[40px] font-black text-white shadow-[0_10px_0_#0a5a1a,0_0_40px_rgb(120_255_140/0.7)] [text-shadow:0_3px_0_#0a5a1a] disabled:opacity-60"
              >
                {busy ? 'CLAIMING…' : `CLAIM ${amount} GOLD`}
              </button>
            </>
          ) : (
            <>
              <p role="status" className="relative mt-2 font-display text-[34px] font-black text-[#b9ffcb] drop-shadow-[0_3px_0_rgb(0_0_0/0.45)]">
                {notice}
              </p>
              <p className="relative mx-auto mt-4 w-fit rounded-full bg-black/40 px-8 py-2 font-display text-[28px] font-black text-[#ffe14d]" aria-label="Gold balance">
                Gold: {fmt(Math.floor(Number(state.total ?? state.gold)))}
              </p>
              <button
                type="button"
                onClick={() => {
                  play('tap');
                  onPlay();
                }}
                className="og-claim lx-tile relative mx-auto mt-6 block rounded-full border-[6px] border-white bg-gradient-to-b from-[#7dff8a] via-[#2fd14a] to-[#108a2a] px-[54px] py-[16px] font-display text-[38px] font-black text-white shadow-[0_10px_0_#0a5a1a,0_0_40px_rgb(120_255_140/0.7)] [text-shadow:0_3px_0_#0a5a1a]"
              >
                PLAY SINGLE PLAYER
              </button>
              <button type="button" onClick={onClose} className="relative mt-4 font-display text-[24px] font-bold text-white/70 underline">
                Later
              </button>
            </>
          )}

          {error && (
            <>
              <p role="alert" className="relative mt-4 font-display text-[24px] font-bold text-red-200">
                {error}
              </p>
              <button type="button" onClick={onClose} className="relative mt-2 font-display text-[24px] font-bold text-white/70 underline">
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
