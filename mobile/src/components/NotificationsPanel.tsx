'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, errorText } from '@/lib/api';
import { getEcho } from '@/lib/echo';
import { when } from '@/lib/hooks';
import { play } from '@/lib/sound';

/**
 * Notification pop-up (Main Lobby and Multiplayer Lobby bells). Everything comes from the server
 * (GET /notifications), newest first:
 *  - pinned on top: the Maintenance announcement (while maintenance is on) and the System
 *    announcement (Admin → Settings → Lobby announcement) — tap to read it in full;
 *  - then your own notifications: Account (Chips received / withdrawn), Lobby (invitations, removed
 *    from a lobby), Friends (requests, accepted) and any other alert.
 * Tapping a notification marks it read (POST /notifications/{id}/read) and performs its action —
 * join the lobby you were invited to, open Friends, open your wallet — or expands it when it has
 * none. "Mark all as read" clears them all. The unread count is reported to the bell after every
 * change. New notifications (private `user.{id}` channel) and maintenance changes (public
 * `maintenance` channel) reload the list live.
 */
export interface NotificationItem {
  id: string;
  type?: string;
  data: { title?: string; message?: string; room_id?: number; from_user_id?: number; reference?: string };
  read_at: string | null;
  created_at: string;
}

export interface NotificationsFeed {
  data: NotificationItem[];
  meta: {
    unread: number;
    announcement?: string | null;
    maintenance?: { label: string; message: string; game_blocked: boolean; transactions_blocked: boolean; changed_at: string | null } | null;
  };
}

/** What tapping a notification does; the screen hosting the panel carries it out. */
export type NotificationAction = { kind: 'lobby'; roomId: number } | { kind: 'friends' } | { kind: 'wallet' };

type Kind = 'account' | 'lobby' | 'game' | 'friends' | 'other';

/** Laravel stores the notification class (App\Notifications\PointsReceived …). */
const className = (type: string | undefined) => type?.split('\\').pop() ?? '';

export function notificationKind(type: string | undefined): Kind {
  const t = className(type);
  if (t === 'PointsReceived' || t === 'ChipsWithdrawn') return 'account';
  if (t === 'RoomInvitation' || t === 'RemovedFromLobby' || t === 'RemovedFromMatch') return 'lobby';
  if (t === 'GameStarted') return 'game';
  if (t === 'FriendRequest') return 'friends';
  return 'other';
}

export function notificationAction(n: NotificationItem): NotificationAction | null {
  const t = className(n.type);
  if (t === 'RoomInvitation' && n.data.room_id) return { kind: 'lobby', roomId: Number(n.data.room_id) };
  if (t === 'FriendRequest') return { kind: 'friends' };
  if (t === 'PointsReceived' || t === 'ChipsWithdrawn') return { kind: 'wallet' };
  return null;
}

const ACTION_LABEL: Record<NotificationAction['kind'], string> = { lobby: 'Join lobby', friends: 'Open Friends', wallet: 'View wallet' };

const KIND: Record<Kind, { label: string; icon: string; tone: string }> = {
  account: { label: 'Account', icon: '💰', tone: 'from-[#5ef08a] to-[#13a344]' },
  lobby: { label: 'Lobby', icon: '🃏', tone: 'from-[#c477ff] to-[#6a1fc9]' },
  game: { label: 'Game', icon: '🎲', tone: 'from-[#ff6b5c] to-[#9c0a12]' },
  friends: { label: 'Friends', icon: '🤝', tone: 'from-[#6fd4ff] to-[#1560d0]' },
  other: { label: 'Alert', icon: '🔔', tone: 'from-[#ffd75a] to-[#e89a00]' },
};

export default function NotificationsPanel({ onClose, onUnread, onAction }: { onClose: () => void; onUnread?: (n: number) => void; onAction?: (a: NotificationAction) => void }) {
  const [feed, setFeed] = useState<NotificationsFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const f = await api<NotificationsFeed>('/notifications');
      setFeed(f);
      setError(null);
      onUnread?.(f.meta.unread);
    } catch (e) {
      setError(errorText(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live: a new notification for me, or maintenance switched on / off.
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    getEcho().then((echo) => {
      if (!echo || cancelled) return;
      // New notifications arrive on user.{id} (useUnreadNotifications) and are re-dispatched as `pusoy:notification`.
      const maintenance = echo.channel('maintenance');
      maintenance.listen('.maintenance.updated', load);
      stop = () => maintenance.stopListening('.maintenance.updated', load);
    });
    window.addEventListener('pusoy:notification', load);
    return () => {
      cancelled = true;
      stop();
      window.removeEventListener('pusoy:notification', load);
    };
  }, [load]);

  const markRead = async (n: NotificationItem) => {
    if (n.read_at) return;
    const now = new Date().toISOString();
    setFeed((f) => (f ? { ...f, data: f.data.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)), meta: { ...f.meta, unread: Math.max(0, f.meta.unread - 1) } } : f));
    try {
      const r = await api<{ meta: { unread: number } }>(`/notifications/${n.id}/read`, { method: 'POST' });
      setFeed((f) => (f ? { ...f, meta: { ...f.meta, unread: r.meta.unread } } : f));
      onUnread?.(r.meta.unread);
    } catch (e) {
      setError(errorText(e));
      load();
    }
  };

  const tap = async (n: NotificationItem) => {
    play('tap');
    await markRead(n);
    const action = notificationAction(n);
    if (action && onAction) {
      onAction(action);
      return;
    }
    setOpen((o) => (o === n.id ? null : n.id));
  };

  const markAll = async () => {
    if (busy) return;
    setBusy(true);
    play('tap');
    try {
      await api('/notifications/read', { method: 'POST' });
      const now = new Date().toISOString();
      setFeed((f) => (f ? { ...f, data: f.data.map((x) => ({ ...x, read_at: x.read_at ?? now })), meta: { ...f.meta, unread: 0 } } : f));
      onUnread?.(0);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  const items = feed?.data ?? [];
  const unread = feed?.meta.unread ?? 0;
  const announcement = feed?.meta.announcement;
  const maintenance = feed?.meta.maintenance;

  const pinned = (id: string, icon: string, title: string, text: string, tone: string) => (
    <button
      type="button"
      onClick={() => {
        play('tap');
        setOpen((o) => (o === id ? null : id));
      }}
      aria-expanded={open === id}
      className={`flex w-full gap-3 rounded-[18px] border-[3px] p-3 text-left ${tone}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#ffe46a] to-[#e08a00] text-[22px]" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[18px] font-black text-[#ffe14d]">{title}</span>
        <span className={`block whitespace-pre-line text-[15px] font-semibold text-white/90 ${open === id ? '' : 'line-clamp-2'}`}>{text}</span>
      </span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onClick={(e) => e.stopPropagation()}
        className="sp-pop lx-gold flex max-h-[94vh] w-full max-w-[760px] flex-col rounded-[28px] p-[6px] shadow-[0_10px_0_#5a2a00,0_18px_40px_rgb(0_0_0/0.5)]"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[23px] bg-gradient-to-b from-[#1d5a8f] via-[#123d66] to-[#08223d] text-white">
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4 [@media(max-height:500px)]:pb-2 [@media(max-height:500px)]:pt-2">
            <h2 className="flex items-center gap-2 font-display text-[clamp(22px,3.4vw,34px)] font-black text-[#ffd34d] drop-shadow-[0_2px_0_#3a1300]">
              Notifications
              {unread > 0 && (
                <span className="rounded-full bg-[#e0262f] px-2.5 text-[16px] text-white" aria-label={`${unread} unread`}>
                  {unread}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={markAll}
                disabled={busy || unread === 0}
                className="lx-tile h-10 rounded-full border-[3px] border-[#fff3a0] bg-gradient-to-b from-[#ffe46a] to-[#e08a00] px-4 font-display text-[15px] font-black text-[#4a1d00] shadow-[0_4px_0_#8a4a00] disabled:opacity-45"
              >
                ✓ Mark all as read
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  play('tap');
                  onClose();
                }}
                className="lx-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 border-[#ffd34d] bg-gradient-to-b from-[#ff6b5c] to-[#c0101a] text-xl font-black text-white shadow-[0_4px_0_#6b0606]"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-5" aria-live="polite">
            {maintenance && pinned('maintenance', '🛠️', `Maintenance — ${maintenance.label}`, maintenance.message, 'border-[#ff8a5c] bg-[#4a1206]/80')}
            {announcement && pinned('announcement', '📢', 'System announcement', announcement, 'border-[#ffd34d] bg-[#3a2a06]/80')}

            {error && (
              <p role="alert" className="rounded-full bg-[#3a0d14] px-4 py-1.5 text-center text-[15px] font-bold text-[#ffb3bd]">
                {error}
              </p>
            )}
            {!feed && !error && <p className="py-8 text-center font-display text-[18px] font-black text-white/70">Loading…</p>}
            {feed && items.length === 0 && !announcement && !maintenance && (
              <div className="py-10 text-center">
                <p className="text-[40px]" aria-hidden="true">
                  🔔
                </p>
                <p className="font-display text-[20px] font-black text-white/80">You&apos;re all caught up.</p>
              </div>
            )}

            <ul className="space-y-2" aria-label="Your notifications">
              {items.map((n) => {
                const k = KIND[notificationKind(n.type)];
                const action = onAction ? notificationAction(n) : null;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => tap(n)}
                      aria-expanded={action ? undefined : open === n.id}
                      className={`flex w-full gap-3 rounded-[18px] p-3 text-left transition hover:bg-black/35 ${!n.read_at ? 'bg-black/30 ring-[3px] ring-[#ffd34d]/80' : 'bg-black/15 ring-1 ring-white/10'}`}
                    >
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b ${k.tone} text-[20px]`} aria-hidden="true">
                        {k.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 font-display text-[17px] font-black">
                          {n.data.title ?? 'Notification'}
                          <span className="rounded-full bg-white/15 px-2 text-[11px] font-black uppercase tracking-wide text-white/80">{k.label}</span>
                          {!n.read_at && <span className="rounded-full bg-[#e0262f] px-2 text-[11px] font-black uppercase text-white">New</span>}
                        </span>
                        {n.data.message && <span className={`block text-[15px] text-white/80 ${open === n.id ? '' : 'line-clamp-2'}`}>{n.data.message}</span>}
                        <span className="mt-0.5 flex items-center justify-between gap-2 text-[12px] text-white/50">
                          {when(n.created_at)}
                          {action && <span className="font-display text-[13px] font-black text-[#ffe14d]">{ACTION_LABEL[action.kind]} ›</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
