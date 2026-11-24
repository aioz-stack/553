'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, errorText } from '@/lib/api';
import { when } from '@/lib/hooks';
import { play } from '@/lib/sound';

/**
 * Notification pop-up opened from the Main Lobby bell. Shows the server's System announcement
 * (Admin → Settings → Lobby announcement) pinned on top, then your own notifications — account
 * updates (Chips received), game notifications (room invitations), friend requests and any other
 * alert the server sends. Opening it marks everything read (POST /notifications/read) so the bell's
 * red dot clears. Rendered in a portal, styled like the other lobby pop-ups.
 */
export interface NotificationItem {
  id: string;
  type?: string;
  data: { title?: string; message?: string };
  read_at: string | null;
  created_at: string;
}

export interface NotificationsFeed {
  data: NotificationItem[];
  meta: { unread: number; announcement?: string | null };
}

type Kind = 'account' | 'game' | 'friends' | 'other';

/** Laravel stores the notification class (App\Notifications\PointsReceived …); group them for the badge. */
export function notificationKind(type: string | undefined): Kind {
  const t = type?.split('\\').pop() ?? '';
  if (t === 'PointsReceived') return 'account';
  if (t === 'RoomInvitation' || t === 'GameStarted') return 'game';
  if (t === 'FriendRequest') return 'friends';
  return 'other';
}

const KIND: Record<Kind, { label: string; icon: string; tone: string }> = {
  account: { label: 'Account', icon: '💰', tone: 'from-[#5ef08a] to-[#13a344]' },
  game: { label: 'Game', icon: '🃏', tone: 'from-[#c477ff] to-[#6a1fc9]' },
  friends: { label: 'Friends', icon: '🤝', tone: 'from-[#6fd4ff] to-[#1560d0]' },
  other: { label: 'Alert', icon: '🔔', tone: 'from-[#ffd75a] to-[#e89a00]' },
};

export default function NotificationsPanel({ onClose, onRead }: { onClose: () => void; onRead?: () => void }) {
  const [feed, setFeed] = useState<NotificationsFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let alive = true;
    api<NotificationsFeed>('/notifications')
      .then(async (f) => {
        if (!alive) return;
        setFeed(f);
        if (f.meta.unread > 0) {
          await api('/notifications/read', { method: 'POST' }).catch(() => undefined);
          onRead?.();
        }
      })
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  const items = feed?.data ?? [];
  const announcement = feed?.meta.announcement;

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
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
            <h2 className="font-display text-[clamp(22px,3.4vw,34px)] font-black text-[#ffd34d] drop-shadow-[0_2px_0_#3a1300]">Notifications</h2>
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

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-5" aria-live="polite">
            {announcement && (
              <div className="flex gap-3 rounded-[18px] border-[3px] border-[#ffd34d] bg-[#3a2a06]/80 p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#ffe46a] to-[#e08a00] text-[22px]" aria-hidden="true">
                  📢
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[18px] font-black text-[#ffe14d]">System announcement</p>
                  <p className="whitespace-pre-line text-[15px] font-semibold text-white/90">{announcement}</p>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-full bg-[#3a0d14] px-4 py-1.5 text-center text-[15px] font-bold text-[#ffb3bd]">
                {error}
              </p>
            )}
            {!feed && !error && <p className="py-8 text-center font-display text-[18px] font-black text-white/70">Loading…</p>}
            {feed && items.length === 0 && !announcement && (
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
                return (
                  <li key={n.id} className={`flex gap-3 rounded-[18px] bg-black/25 p-3 ${!n.read_at ? 'ring-[3px] ring-[#ffd34d]/80' : 'ring-1 ring-white/10'}`}>
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b ${k.tone} text-[20px]`} aria-hidden="true">
                      {k.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-display text-[17px] font-black">
                        {n.data.title ?? 'Notification'}
                        <span className="rounded-full bg-white/15 px-2 text-[11px] font-black uppercase tracking-wide text-white/80">{k.label}</span>
                        {!n.read_at && <span className="rounded-full bg-[#e0282f] px-2 text-[11px] font-black uppercase text-white">New</span>}
                      </p>
                      {n.data.message && <p className="text-[15px] text-white/80">{n.data.message}</p>}
                      <p className="mt-0.5 text-[12px] text-white/50">{when(n.created_at)}</p>
                    </div>
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
