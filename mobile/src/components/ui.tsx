'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useOnline } from '@/lib/hooks';
import { useBalance } from '@/lib/useBalance';
import { Avatar, CoinPill, GameButton, GlassCard } from './game';
import { IconBack, IconBell, IconSpade } from './icons';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/** Player's own balances for the HUD (never other players' balances). */
function useHudBalances(enabled: boolean, userId?: number) {
  return useBalance(enabled ? userId : undefined);
}

/**
 * Authenticated mobile screen: game backdrop, HUD (avatar + coin pills) or a
 * back/title bar and offline banner (no bottom tab bar). Redirects to /login when there is no session.
 */
export function Screen({ title, children, back, action, hud = true, bare, immersive }: { title: string; children: ReactNode; back?: boolean; action?: ReactNode; hud?: boolean; bare?: boolean; immersive?: boolean }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const online = useOnline();
  const balances = useHudBalances(!!user && hud && !back && !immersive, user?.id);

  useEffect(() => {
    if (ready && !user) {
      router.replace('/login/');
    }
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="game-bg flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const name = user.display_name ?? user.name;

  // Full-bleed screens (the beach home) draw their own chrome.
  if (immersive) {
    return (
      <div className="relative min-h-dvh overflow-hidden text-white">
        {!online && <div className="safe-top relative z-30 bg-warning-500 px-4 py-1 text-center text-xs font-bold text-white">Offline — reconnecting when the network returns</div>}
        {children}
      </div>
    );
  }

  return (
    <div className="game-bg flex min-h-dvh flex-col text-white">
      <header className="safe-top sticky top-0 z-20 bg-gradient-to-b from-night-950/95 to-night-900/80 shadow-[0_6px_20px_rgb(0_0_0/0.35)] backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4">
          {back ? (
            <>
              <button onClick={() => (window.history.length > 1 ? router.back() : router.replace('/home/'))} className="glass -ml-1 flex h-10 w-10 items-center justify-center rounded-2xl" aria-label="Back">
                <IconBack className="h-5 w-5" />
              </button>
              <h1 className="flex-1 truncate font-display text-xl font-extrabold">{title}</h1>
              {action}
            </>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={name} size={42} avatar={user?.avatar} userId={user?.id} />
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-extrabold leading-tight">{name}</span>
                  <span className="block truncate text-[11px] text-white/60">{title}</span>
                </span>
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                {hud && <CoinPill amount={balances.chips} currency="CH" compact />}
                {action ?? (
                  <Link href="/notifications/" className="glass flex h-9 w-9 items-center justify-center rounded-xl" aria-label="Notifications">
                    <IconBell className="h-5 w-5 text-gold-300" />
                  </Link>
                )}
              </span>
            </>
          )}
        </div>
        {!online && <div className="bg-warning-500 px-4 py-1 text-center text-xs font-bold text-white">Offline — reconnecting when the network returns</div>}
      </header>

      <main className={cx('suit-pattern flex-1', !bare && 'px-4 py-4')}>{children}</main>

    </div>
  );
}

export function Panel({ title, children, className, action }: { title?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <GlassCard title={title} action={action} className={className}>
      {children}
    </GlassCard>
  );
}

/** Kept for API compatibility; renders a game-style 3D button. */
export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'danger' | 'success' }) {
  const tone = { primary: 'gold', outline: 'glass', danger: 'red', success: 'green' } as const;

  return <GameButton tone={tone[variant]} className={className} {...props} />;
}

export function Field({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block font-display text-sm font-bold text-white/85">{label}</span>
      <input
        {...props}
        className="h-12 w-full rounded-2xl border-2 border-white/15 bg-night-950/60 px-4 text-base text-white shadow-inner outline-none placeholder:text-white/35 focus:border-gold-400"
      />
      {error && <span className="mt-1 block text-xs font-semibold text-candy-400">{error}</span>}
    </label>
  );
}

export function Notice({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  const styles = {
    error: 'border-red-400/50 bg-red-500/20 text-red-100',
    success: 'border-mint-400/50 bg-mint-500/20 text-mint-100',
    info: 'border-sky-400/40 bg-sky-500/15 text-sky-50',
    warning: 'border-gold-400/50 bg-gold-500/20 text-gold-100',
  };

  return <div className={cx('mb-3 rounded-2xl border px-4 py-3 text-sm font-semibold', styles[tone])}>{children}</div>;
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'brand' | 'success' | 'error' | 'warning' }) {
  const styles = {
    gray: 'bg-white/12 text-white/85',
    brand: 'bg-felt-500/40 text-white',
    success: 'bg-mint-500/30 text-mint-100',
    error: 'bg-red-500/35 text-red-100',
    warning: 'bg-gold-500/30 text-gold-100',
  };

  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 font-display text-xs font-bold', styles[tone])}>{children}</span>;
}

export function Spinner() {
  return (
    <div className="mx-auto flex h-14 w-14 animate-spin items-center justify-center rounded-full border-4 border-gold-400 border-t-transparent" role="status" aria-label="Loading">
      <IconSpade className="h-5 w-5 animate-none text-gold-300" />
    </div>
  );
}
