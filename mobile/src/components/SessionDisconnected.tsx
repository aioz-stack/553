'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { setToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getEcho } from '@/lib/echo';

export const DISCONNECTED_EVENT = 'pusoy:disconnected';
export const ACCOUNT_ALREADY_CONNECTED = {
  title: 'Account Already Connected',
  message: 'This account has been detected logging in from multiple sessions. For security reasons, all sessions have been disconnected. Please log in again to continue.',
};

export interface DisconnectedNotice {
  title: string;
  message: string;
}

/**
 * One active login per player: when the server signs every session of this account out (a
 * duplicate login, or this device was replaced by a newer sign-in), this popup covers the app —
 * nothing behind it can be used — and OK goes to the login screen. Triggered by the API answer
 * (`account_already_connected` / `session_replaced`, see lib/api) or at once by the server's
 * `account.disconnected` event on the player's private channel.
 */
export default function SessionDisconnected() {
  const router = useRouter();
  const { user } = useAuth();
  const [notice, setNotice] = useState<DisconnectedNotice | null>(null);

  useEffect(() => {
    const on = (e: Event) => setNotice((e as CustomEvent<DisconnectedNotice>).detail ?? ACCOUNT_ALREADY_CONNECTED);
    window.addEventListener(DISCONNECTED_EVENT, on);
    return () => window.removeEventListener(DISCONNECTED_EVENT, on);
  }, []);

  // Live: the server tells every open app of this account at once.
  useEffect(() => {
    if (!user?.id) return undefined;
    let stop = () => {};
    let cancelled = false;
    getEcho()
      .then((echo) => {
        if (!echo || cancelled) return;
        const channel = echo.private(`user.${user.id}`);
        const onKick = (e: Partial<DisconnectedNotice>) => {
          void setToken(null);
          setNotice({ title: e.title ?? ACCOUNT_ALREADY_CONNECTED.title, message: e.message ?? ACCOUNT_ALREADY_CONNECTED.message });
        };
        channel.listen('.account.disconnected', onKick);
        stop = () => channel.stopListening('.account.disconnected', onKick);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop();
    };
  }, [user?.id]);

  if (!notice) return null;

  const done = () => {
    setNotice(null);
    void setToken(null);
    router.replace('/login/');
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-6" role="alertdialog" aria-modal="true" aria-labelledby="disconnected-title" aria-describedby="disconnected-text">
      <div className="w-full max-w-md rounded-3xl border-4 border-[#ffd34d] bg-gradient-to-b from-[#7a0f16] to-[#2e0306] p-6 text-center text-white shadow-[0_12px_0_#3a0204,0_20px_40px_rgb(0_0_0/0.6)]">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#ffd34d] bg-[#3a0d14] text-4xl" aria-hidden="true">
          ⚠
        </div>
        <h2 id="disconnected-title" className="font-display text-2xl font-black text-[#ffe14d]">
          {notice.title}
        </h2>
        <p id="disconnected-text" className="mt-3 text-base font-semibold leading-relaxed text-white/90">
          {notice.message}
        </p>
        <button type="button" onClick={done} autoFocus className="mt-6 h-14 w-full rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] font-display text-xl font-black text-[#4a1d00] shadow-[0_5px_0_#8a4a00]">
          OK — Log in again
        </button>
      </div>
    </div>
  );
}
