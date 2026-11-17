'use client';

import Link from 'next/link';
import { GlassCard } from '@/components/game';
import { Badge, Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { points, titleCase, useFetch, when } from '@/lib/hooks';

interface Game {
  id: number;
  room: { name: string };
  status: string;
  currency: string;
  started_at: string;
  my_result: { score: number; placement: number; net: string } | null;
}

interface Stats {
  rounds: { played: number; won: number; lost: number; tied: number; total_bets: string; total_winnings: string; total_losses: string; lucky_hands: number; lucky_bonuses: string };
  banker: { rounds: number; bets_received: string; payouts: string; winnings: string; losses: string; remaining_rounds: number };
  balances: Record<string, string>;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl bg-black/25 px-2 py-1.5 text-center">
      <p className={`font-display text-base font-black ${tone ?? 'text-gold-200'}`}>{value}</p>
      <p className="text-[10px] font-bold uppercase text-white/55">{label}</p>
    </div>
  );
}

const MEDAL = ['👑', '🥈', '🥉', '4'];

export default function History() {
  const { user } = useAuth();
  const { data, loading } = useFetch<{ data: Game[] }>(user ? '/profile/games' : null);
  const stats = useFetch<{ data: Stats }>(user ? '/profile/stats' : null).data?.data;
  const short = (v: string | undefined) => points(v).replace(/.00$/, '');

  return (
    <Screen title="Game history" back>
      {stats && (
        <>
          <GlassCard title="Rounds">
            <div className="grid grid-cols-4 gap-1.5">
              <Stat label="Played" value={stats.rounds.played} />
              <Stat label="Won" value={stats.rounds.won} tone="text-mint-400" />
              <Stat label="Lost" value={stats.rounds.lost} tone="text-candy-400" />
              <Stat label="Tied" value={stats.rounds.tied} tone="text-white" />
              <Stat label="Bets" value={short(stats.rounds.total_bets)} />
              <Stat label="Winnings" value={short(stats.rounds.total_winnings)} tone="text-mint-400" />
              <Stat label="Losses" value={short(stats.rounds.total_losses)} tone="text-candy-400" />
              <Stat label="Lucky" value={`${stats.rounds.lucky_hands} · ${short(stats.rounds.lucky_bonuses)}`} />
            </div>
            <p className="mt-2 text-center text-xs text-white/60">Balance: {points(stats.balances.VC ?? 0)} VC</p>
          </GlassCard>
          {stats.banker.rounds > 0 && (
            <GlassCard title="As banker" action={<Link href="/transactions/?role=banker" className="font-display text-xs font-black text-gold-300">Banker history ›</Link>}>
              <div className="grid grid-cols-3 gap-1.5">
                <Stat label="Rounds" value={stats.banker.rounds} />
                <Stat label="Bets received" value={short(stats.banker.bets_received)} />
                <Stat label="Paid out" value={short(stats.banker.payouts)} />
                <Stat label="Won" value={short(stats.banker.winnings)} tone="text-mint-400" />
                <Stat label="Lost" value={short(stats.banker.losses)} tone="text-candy-400" />
                <Stat label="Rounds left" value={stats.banker.remaining_rounds} />
              </div>
            </GlassCard>
          )}
        </>
      )}
      {loading && <Spinner />}
      {data?.data.length === 0 && <p className="pt-10 text-center text-white/60">No games yet — go win one!</p>}
      <div className="space-y-2">
        {data?.data.map((g) => (
          <Link key={g.id} href={`/results/?id=${g.id}`} className="glass flex items-center gap-3 rounded-2xl p-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-felt-400 to-felt-700 font-display text-lg font-black">
              {g.my_result ? MEDAL[g.my_result.placement - 1] : '•'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-extrabold">{g.room.name}</p>
              <p className="text-[11px] text-white/55">#{g.id} · {when(g.started_at)}</p>
            </div>
            {g.my_result ? (
              <div className="text-right">
                <p className="font-display text-sm font-black text-gold-200">{g.my_result.score} pts</p>
                <p className={`text-xs font-bold ${Number(g.my_result.net) >= 0 ? 'text-mint-400' : 'text-candy-400'}`}>{points(g.my_result.net, g.currency)}</p>
              </div>
            ) : (
              <Badge>{titleCase(g.status)}</Badge>
            )}
          </Link>
        ))}
      </div>
    </Screen>
  );
}
