'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getEcho } from '@/lib/echo';
import { MAINTENANCE_EVENT, MAINTENANCE_IMAGE, MAINTENANCE_POLL_MS, fetchMaintenance, type MaintenanceStatus } from '@/lib/maintenance';
import { useLandscapeLock } from '@/lib/useLandscapeLock';

/**
 * Wraps the whole app. While the Admin Panel has the game in maintenance (Full Maintenance or
 * Mobile Game), the app shows only the Pusoy553 maintenance artwork — full screen, landscape,
 * never stretched — and none of the normal screens (login, lobby, tables, gameplay). It finds
 * out from GET /status at start-up, every 30 s, when the app comes back to the foreground, from
 * the public Reverb channel "maintenance", and from any 503 "maintenance" API answer. When the
 * Admin turns it OFF the app returns to normal by itself.
 */
export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let alive = true;
    const apply = (s: Partial<MaintenanceStatus> | null | undefined) => {
      if (alive && s && typeof s.game_blocked === 'boolean') setBlocked(s.game_blocked);
    };
    const check = () => {
      fetchMaintenance().then(apply).catch(() => undefined); // offline: keep the last known state
    };

    check();
    const timer = window.setInterval(check, MAINTENANCE_POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    const onBlocked = (e: Event) => {
      const detail = (e as CustomEvent<MaintenanceStatus | null>).detail;
      if (detail) apply(detail);
      else setBlocked(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(MAINTENANCE_EVENT, onBlocked);

    let leave: (() => void) | null = null;
    getEcho()
      .then((echo) => {
        if (!echo || !alive) return;
        echo.channel('maintenance').listen('.maintenance.updated', apply);
        leave = () => echo.leaveChannel('maintenance');
      })
      .catch(() => undefined);

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(MAINTENANCE_EVENT, onBlocked);
      leave?.();
    };
  }, []);

  return blocked ? <MaintenanceScreen /> : <>{children}</>;
}

/** Full-screen artwork; the phone is locked to landscape (a portrait browser rotates it). */
export function MaintenanceScreen() {
  useLandscapeLock();

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#12051f]" role="alert" aria-live="assertive">
      <div className="absolute left-1/2 top-1/2 h-[100vh] w-[100vw] -translate-x-1/2 -translate-y-1/2 portrait:h-[100vw] portrait:w-[100vh] portrait:rotate-90">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export: plain image */}
        <img
          src={MAINTENANCE_IMAGE}
          alt="Pusoy553 system maintenance. Pusoy553 is currently under maintenance. We're working to improve your gaming experience. Please check back soon!"
          className="h-full w-full select-none object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
