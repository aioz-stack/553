'use client';

import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { play } from '@/lib/sound';
import type { Friend, FriendsData } from '@/lib/types';
import { Avatar } from './game';
import { springStyle } from '@/lib/spring';
import { Glitter, RimGlint } from './Sparkles';
import { IconCheck, IconClose, IconSend, IconUserPlus, IconUsers } from './icons';

/** "Last seen 2h ago" style label. */
export function seenAgo(iso: string | null): string {
  if (!iso) {
    return 'Never online';
  }
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  return `Last seen ${Math.round(hours / 24)}d ago`;
}

/**
 * Friends List panel for the landscape home (laid out in the 1600×900 stage).
 * Search, add by username, accept/decline requests, online status, last
 * seen, and invite an online friend to the table you are seated at.
 * Shows names, level and status only — never balances.
 */
export default function FriendsPanel({ enabled }: { enabled: boolean }) {
  const { data, reload } = useFetch<{ data: FriendsData }>(enabled ? '/friends' : null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [username, setUsername] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, [enabled, reload]);

  const run = async (fn: () => Promise<{ message?: string }>) => {
    play('tap');
    try {
      const r = await fn();
      setNote(r.message ? { ok: true, text: r.message } : null);
      reload();
      return true;
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
      return false;
    }
  };

  const f = data?.data;
  const match = (x: Friend) => !query.trim() || `${x.name} ${x.username}`.toLowerCase().includes(query.trim().toLowerCase());
  const friends = (f?.friends ?? []).filter(match);
  const incoming = (f?.incoming ?? []).filter(match);

  return (
    <div className="lx-gold relative h-full rounded-[34px] p-[7px] shadow-[0_10px_0_#9a5b03,0_20px_40px_rgb(0_0_0/0.45),inset_0_2px_0_rgb(255_255_255/0.8)]">
    <section aria-label="Friends list" className="flex h-full flex-col rounded-[28px] bg-gradient-to-b from-[#3a2142]/95 to-[#1e1026]/95 p-3 shadow-[inset_0_4px_14px_rgb(0_0_0/0.45)]">
      <header className="lx-gloss relative mb-3 flex items-center gap-3 rounded-[20px] bg-gradient-to-b from-[#5a2f63] to-[#2a1530] px-4 py-2 shadow-[inset_0_2px_0_rgb(255_255_255/0.2)]">
        <IconUsers className="lx-bob relative z-[4] h-11 w-11 text-[#ffc531] drop-shadow-[0_2px_0_#8a4a00]" />
        <Glitter count={6} seed={5} size={0.8} />
        <h2 className="lx-text-shine relative z-[4] flex-1 font-display text-[34px] font-black drop-shadow-[0_2px_0_rgb(0_0_0/0.6)]" style={{ ['--c' as string]: '#ffe9a8' }}>Friends List ({f?.friends.length ?? 0})</h2>
        <button
          type="button"
          onClick={() => {
            play('tap');
            setAdding(!adding);
            setNote(null);
          }}
          aria-label="Add friend"
          style={springStyle('add-friend', 2.8, 1)} className="lx-tile lx-gloss lx-spring relative z-[4] flex h-[64px] w-[64px] items-center justify-center rounded-[16px] border-4 border-[#fff3a6] bg-gradient-to-b from-[#ffd75a] to-[#e89a00] text-[#5a2600] shadow-[0_4px_0_#8a4a00]"
        >
          <RimGlint width={4} delay={0.9} />
          <IconUserPlus className="relative z-[4] h-10 w-10" />
        </button>
      </header>

      {adding ? (
        <form
          className="mb-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (username.trim() && (await run(() => api('/friends', { method: 'POST', body: { username: username.trim() } })))) {
              setUsername('');
              setAdding(false);
            }
          }}
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Friend's username"
            aria-label="Friend's username"
            autoCapitalize="none"
            autoFocus
            className="h-[64px] min-w-0 flex-1 rounded-full border-4 border-[#8d6bd8] bg-[#1b1030] px-6 text-[26px] text-white outline-none placeholder:text-white/45 focus:border-[#ffc531]"
          />
          <button type="submit" className="h-[64px] rounded-full bg-gradient-to-b from-mint-400 to-mint-600 px-6 font-display text-[26px] font-black text-white shadow-[0_4px_0_#0d6b47]">
            ADD
          </button>
        </form>
      ) : (
        <label className="mb-3 flex h-[64px] items-center gap-3 rounded-full border-4 border-[#8d6bd8] bg-[#1b1030] px-5">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-white/80" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search friend..."
            aria-label="Search friends"
            className="h-full min-w-0 flex-1 bg-transparent text-[26px] text-white outline-none placeholder:text-white/60"
          />
        </label>
      )}

      {note && <p className={`mb-2 px-2 text-[22px] font-bold ${note.ok ? 'text-mint-400' : 'text-candy-400'}`}>{note.text}</p>}

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-color:#ffc531_transparent]">
        {incoming.map((r) => (
          <li key={`in-${r.id}`} className="lx-in flex items-center gap-3 rounded-[18px] bg-[#ffc531]/15 p-2 ring-2 ring-[#ffc531]/60">
            <Avatar name={r.name} avatar={r.avatar} userId={r.user_id} size={72} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[28px] font-extrabold text-white">{r.name}</span>
              <span className="block text-[20px] text-[#ffe9a8]">wants to be friends</span>
            </span>
            <button aria-label={`Accept ${r.name}`} onClick={() => run(() => api(`/friends/${r.id}/accept`, { method: 'POST' }))} className="flex h-14 w-14 items-center justify-center rounded-full bg-mint-500 text-white">
              <IconCheck className="h-8 w-8" />
            </button>
            <button aria-label={`Decline ${r.name}`} onClick={() => run(() => api(`/friends/${r.id}`, { method: 'DELETE' }))} className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white">
              <IconClose className="h-8 w-8" />
            </button>
          </li>
        ))}

        {friends.map((fr, i) => (
          <li key={fr.id} style={{ animationDelay: `${i * 70}ms` }} className="lx-in flex items-center gap-3 rounded-[18px] border-2 border-white/5 bg-gradient-to-b from-white/10 to-black/30 p-2 shadow-[inset_0_2px_0_rgb(255_255_255/0.08)] transition-transform active:scale-[0.98]">
            <span className="relative">
              <Avatar name={fr.name} avatar={fr.avatar} userId={fr.user_id} size={76} />
              <span className="absolute -bottom-1 -right-1 rounded-full bg-[#ffc531] px-1.5 font-display text-[16px] font-black text-[#5a2600]">{fr.level}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[28px] font-extrabold text-white">{fr.name}</span>
              {fr.online ? (
                <span className="flex items-center gap-2 text-[22px] font-bold text-[#4ee36b]">
                  <span className="lx-pulse-dot h-4 w-4 rounded-full bg-[#2fd14f]" />
                  {fr.in_game ? `Playing${fr.room_name ? ` · ${fr.room_name}` : ''}` : 'Online'}
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2 text-[22px] font-bold text-white/70">
                    <span className="h-4 w-4 rounded-full bg-white/50" />
                    Offline
                  </span>
                  <span className="block text-[18px] text-white/60">{seenAgo(fr.last_seen_at)}</span>
                </>
              )}
            </span>
            {fr.online && !fr.in_game && (
              <button
                aria-label={`Invite ${fr.name}`}
                onClick={() => run(() => api(`/friends/${fr.user_id}/invite`, { method: 'POST' }))}
                style={springStyle(fr.id, 2.6, 1.4)} className="lx-tile lx-spring flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#ffc531] bg-gradient-to-b from-sky-400 to-brand-600 text-white shadow-[0_3px_0_#0b3a80]"
              >
                <IconSend className="h-7 w-7" />
              </button>
            )}
          </li>
        ))}

        {(f?.outgoing ?? []).filter(match).map((r) => (
          <li key={`out-${r.id}`} className="flex items-center gap-3 rounded-[18px] p-2 opacity-70">
            <Avatar name={r.name} avatar={r.avatar} userId={r.user_id} size={60} />
            <span className="min-w-0 flex-1 truncate text-[22px] text-white">{r.name} · request sent</span>
          </li>
        ))}

        {f && friends.length + incoming.length === 0 && (
          <li className="px-3 py-6 text-center text-[22px] text-white/65">{query ? 'No friends match your search.' : 'No friends yet. Tap the add button to invite someone by username.'}</li>
        )}
      </ul>
    </section>
    </div>
  );
}
