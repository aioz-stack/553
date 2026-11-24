'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { getEcho } from './echo';

/**
 * Unread notification count for the Main Lobby bell. Loaded from /notifications, bumped live when
 * the server broadcasts a new notification on the private `user.{id}` channel (Laravel broadcast
 * notifications), and reloaded when the app comes back to the foreground.
 */
export function useUnreadNotifications(userId: number | undefined) {
  const [unread, setUnread] = useState(0);

  const reload = useCallback(() => {
    if (!userId) return;
    api<{ meta: { unread: number } }>('/notifications')
      .then((r) => setUnread(r?.meta?.unread ?? 0))
      .catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) return undefined;
    let stop = () => {};
    let cancelled = false;

    getEcho().then((echo) => {
      if (!echo || cancelled) return;
      const channel = echo.private(`user.${userId}`);
      channel.notification(() => setUnread((n) => n + 1));
      stop = () => channel.stopListening('.Illuminate\Notifications\Events\BroadcastNotificationCreated');
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, reload]);

  return { unread, reload, clear: useCallback(() => setUnread(0), []) };
}
