'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CandyText, GoldCoins } from '@/components/HomeArt';
import LandscapeStage from '@/components/LandscapeStage';
import PlayingCard, { sortCards } from '@/components/PlayingCard';
import DealAnimation from '@/components/table/DealAnimation';
import GoldWalletHud from '@/components/table/GoldWalletHud';
import LuckPopup from '@/components/table/LuckPopup';
import { useCardDrag } from '@/components/table/useCardDrag';
import { fxAt, isUp, laneShown, RevealBanner, RevealFx, revealPlan, useRevealClock, type RevealPlan } from '@/components/table/RevealShow';
import { Chip, Clover, LanternRoom, MiniCrest, PokerTable } from '@/components/table/TableArt';
import { Avatar } from '@/components/game';
import { BOT_AVATARS } from '@/lib/avatars';
import { Screen } from '@/components/ui';
import { api, ApiError, errorText, idempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { OUT_OF_GOLD_URL, leaveMatch, type GoldWallet } from '@/lib/gold';
import { PICKER_URL, saveSelection, selectionFromUrl, type PracticeTier } from '@/lib/singlePlayer';
import { savePrefs } from '@/lib/prefs';
import { play, useSound } from '@/lib/sound';
import { useGoldWallet } from '@/lib/useGoldWallet';
import { useLandscapeLock } from '@/lib/useLandscapeLock';
import { reducedNow } from '@/lib/motion';

type Lane = 'front' | 'middle' | 'back';
type Zone = Lane | 'hand';
type Rows = Record<Lane, string[]>;

export interface RoundPlayer {
  seat: number;
  name: string;
  is_you: boolean;
  is_banker: boolean;
  /** This seat's bet (0 for the banker). */
  bet: number;
  front?: string[];
  middle?: string[];
  back?: string[];
  labels?: Record<Lane, string>;
  is_foul?: boolean;
  /** On a misplaced hand: the lanes out of order. */
  misplaced?: string[];
  lucky?: { type: string; label: string } | null;
  /** This seat's lanes vs the banker (1 win / -1 loss); null for the banker or when a Lucky Hand decided. */
  lanes?: Record<Lane, number> | null;
  multiple?: number | null;
  gold?: number;
}

export interface RoundState {
  id: number;
  status: 'arranging' | 'completed' | 'abandoned';
  round: number;
  rounds_total: number;
  /** Banker seat: 1 = you, 2-4 = bots. */
  banker: number;
  banker_name: string;
  tier: { key: string; name: string };
  bet: number;
  wagering: boolean;
  reserved: number;
  /** When you bank: the total of the other players' bets you cover. */
  covered?: number;
  cards: string[];
  players: RoundPlayer[];
  /** Your result: lanes vs the banker (null when you bank or a Lucky Hand decided), the bet multiple, Gold won/lost. */
  result: { lanes: Record<Lane, number> | null; multiple: number | null; gold: number; misplaced?: boolean; lucky_failed?: boolean } | null;
  lucky?: { type: string; label: string; multiplier: number } | null;
  deck_commitment: string;
  server_seed: string | null;
  allow_foul: boolean;
}

export interface MatchState {
  id: number;
  status: 'active' | 'completed' | 'abandoned' | 'out_of_gold';
  /** The match ended early: you ran out of Gold (Single Player leaves for Home and the free Gold). */
  out_of_gold?: boolean;
  tier: { key: string; name: string };
  rounds_total: number;
  rounds_played: number;
  next_round: number | null;
  next_banker: number | null;
  next_banker_name: string | null;
  wagering: boolean;
  gold: number;
  standings: Array<{ seat: number; name: string; gold: number }>;
  history: Array<{ round: number; banker: number; banker_name: string; bet: number; covered?: number; multiple: number | null; gold: number; lucky: string | null }>;
  current: RoundState | null;
}

const LANES: Lane[] = ['front', 'middle', 'back'];
const SIZE: Record<Lane, number> = { front: 3, middle: 5, back: 5 };
const EMPTY: Rows = { front: [], middle: [], back: [] };
const CHIP_COLORS = ['#1f6fe0', '#14a046', '#e0262f'];
const BOTS: Record<number, string> = { 2: 'LuckyBot', 3: 'CardBot', 4: 'AceBot' };

/** Where each bot sits on the 1600×900 stage, its look, where its face-down cards and revealed hand go. */
const SEATS: Record<number, { x: number; y: number; stack: { x: number; y: number }; reveal: { x: number; y: number }; horizontal?: boolean }> = {
  2: { x: 36, y: 380, stack: { x: 66, y: 288 }, reveal: { x: 196, y: 318 } },
  3: { x: 738, y: 94, stack: { x: 890, y: 130 }, reveal: { x: 560, y: 262 }, horizontal: true },
  4: { x: 1440, y: 380, stack: { x: 1470, y: 288 }, reveal: { x: 1196, y: 318 } },
};

const fmt = (n: number) => n.toLocaleString('en-US');
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? 'text-[#7dffa0]' : n < 0 ? 'text-[#ff9aa8]' : 'text-white');
const bankerFor = (round: number) => ((round - 1) % 4) + 1;
const banksText = (seat: number) => (seat === 1 ? 'You bank' : `${BOTS[seat]} banks`);

/** True when every card in the lanes belongs to `hand` (no card from another round). */
/** True the first time a round's deal is shown in this browser session (the animation never replays for a round). */
function firstShowing(roundId: number): boolean {
  const key = `pusoy.dealt.${roundId}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    // No storage (private mode): the in-page state still plays it only once per deal.
  }
  return true;
}

/** True the first time a round's reveal show is played in this browser session (it never replays). */
function firstReveal(roundId: number): boolean {
  const key = `pusoy.revealed.${roundId}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    // No storage: the in-page state still plays it once per submit.
  }
  return true;
}

/** Win / lose / even jingle for your result in a settled round. */
function resultSound(r: RoundState) {
  const g = r.result?.gold ?? 0;
  play(g > 0 ? 'win' : g < 0 ? 'lose' : 'start');
}

function rowsUse(rows: Rows, hand: Set<string>): boolean {
  return [...rows.front, ...rows.middle, ...rows.back].every((c) => hand.has(c));
}

function RoundButton({ label, onClick, children, x }: { label: string; onClick: () => void; children: ReactNode; x: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{ left: x }}
      className="lx-tile absolute top-[18px] z-20 flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-[#ffc531] bg-gradient-to-b from-[#b3141b] to-[#5a0609] text-[#ffd34d] shadow-[0_6px_0_#3a0204,inset_0_3px_0_rgb(255_255_255/0.25)]"
    >
      {children}
    </button>
  );
}

function BankerBadge() {
  return <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border-[3px] border-white bg-gradient-to-b from-[#ffd34d] to-[#e08a00] px-3 font-display text-[16px] font-black text-[#4a1d00] shadow-[0_3px_0_#7a3e00]">BANKER</span>;
}

function SeatTile({ avatar, name, status, banker, glow, x, y }: { avatar: string; name: string; status?: ReactNode; banker?: boolean; glow?: boolean; x: number; y: number }) {
  return (
    <div className="absolute z-10 flex w-[124px] flex-col items-center" style={{ left: x, top: y }} aria-label={`${name}${banker ? ' (banker)' : ''}`}>
      <div className={`relative rounded-[18px] p-[6px] ${banker ? 'bg-gradient-to-b from-[#9fe0ff] to-[#1f6fe0] shadow-[0_0_24px_rgb(80_180_255/0.9),0_6px_0_#0c3a8a]' : 'lx-gold shadow-[0_6px_0_#7a3e00]'} ${glow ? 'tb-winner' : ''}`}>
        {banker && <BankerBadge />}
        <div className="overflow-hidden rounded-[12px] border-2 border-white/60">
          <Avatar name={name} avatar={avatar} size={108} square rim={false} />
        </div>
      </div>
      <span className="mt-1 rounded-full bg-black/60 px-3 py-0.5 font-display text-[18px] font-black text-white">{name}</span>
      {status && <span className="mt-0.5 whitespace-nowrap font-display text-[17px] font-black">{status}</span>}
    </div>
  );
}

function Outcome({ v }: { v: number }) {
  const [txt, cls] = v > 0 ? ['WIN', 'bg-[#13a344]'] : v < 0 ? ['LOSS', 'bg-[#d81e3c]'] : ['TIE', 'bg-white/30'];
  return <span className={`rounded-full px-2 py-[1px] font-display text-[14px] font-black text-white ${cls}`}>{txt}</span>;
}

/** A revealed hand, laid out in rows or side by side, with this seat's lane results vs the banker. */
function RevealedHand({ p, card, step, gap, horizontal, plan = null, now = Number.POSITIVE_INFINITY, hit = false }: { p: RoundPlayer; card: { w: number; h: number; f: number }; step: number; gap: number; horizontal?: boolean; plan?: RevealPlan | null; now?: number; hit?: boolean }) {
  return (
    <div className={`flex ${horizontal ? 'flex-row items-start' : 'flex-col'}`} style={{ gap }} aria-label={`${p.is_you ? 'Your' : `${p.name}'s`} hand`}>
      {LANES.map((lane) => (
        <div key={lane} className={`flex gap-2 ${horizontal ? 'flex-col items-center' : 'items-center'}`}>
          <div className={`relative shrink-0 ${hit && p.misplaced?.includes(lane) ? 'rv-hit' : ''}`} style={{ width: card.w + step * (SIZE[lane] - 1), height: card.h }}>
            {(p[lane] ?? []).map((c, i) => (
              // The wrapper carries the position: PlayingCard is itself `relative`. During the reveal show each
              // card is a two-sided 3D card that turns face up at its moment (the back only exists until then).
              <span key={c} className="absolute top-0 [perspective:600px]" style={{ left: i * step, width: card.w, height: card.h }}>
                <span className="rv-card relative block h-full w-full" style={{ transform: isUp(plan, now, p.seat, lane, i) ? 'none' : 'rotateY(180deg)' }}>
                  <span className="absolute inset-0 [backface-visibility:hidden]">
                    <PlayingCard code={c} style={{ width: card.w, height: card.h, fontSize: card.f }} />
                  </span>
                  {plan && (
                    <span className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <PlayingCard faceDown style={{ width: card.w, height: card.h }} />
                    </span>
                  )}
                </span>
              </span>
            ))}
          </div>
          <span className={`flex gap-1 ${horizontal ? 'flex-row' : 'flex-col items-start'} ${laneShown(plan, now, lane) ? '' : 'invisible'}`}>
            {p.labels && <span className="whitespace-nowrap rounded-full bg-black/55 px-2 font-display text-[15px] font-black text-[#ffe14d]">{p.labels[lane]}</span>}
            {p.lanes && <Outcome v={p.lanes[lane]} />}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Single Player — Round Bank Pusoy (Chinese Poker): you and three bots
 * (LuckyBot, CardBot, AceBot) on the landscape table (1600×900 stage).
 * A match is 12 rounds; the banker rotates You → LuckyBot → CardBot → AceBot.
 * Before every round you pick the table bet from your difficulty's chips;
 * the server deals 13 cards to each seat, the bots arrange themselves, you
 * arrange Front / Middle / Back (fouls are refused), and every non-banker's
 * lanes are compared with the banker's: an identical lane goes to the banker,
 * 3-0 = 2× bet, 2-1 = 1× bet (and the negatives); Lucky Hands pay 2×.
 * Gold Wallet: every settled round credits or deducts your Gold on the
 * server (the screen only shows it). When a round leaves you Out of Gold the
 * server ends the match; after the reveal this screen returns you to Home,
 * which offers the free Gold (Single Player only).
 */
export default function Practice() {
  const { user } = useAuth();
  const router = useRouter();
  // Your Gold wallet from the server (Total Amount): the same source as Home and the arrangement popup.
  const { wallet: goldWallet } = useGoldWallet(user?.id);
  const [soundOn] = useSound();
  useLandscapeLock();

  const [tier, setTier] = useState<PracticeTier | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [phase, setPhase] = useState<'loading' | 'betting' | 'arranging' | 'revealed'>('loading');
  const [bet, setBet] = useState<number | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'settings' | 'help' | 'leave' | 'summary' | null>(null);
  const [luck, setLuck] = useState<Rows | null>(null);
  const [declaring, setDeclaring] = useState(false);
  const [notice, setNotice] = useState<'lucky' | 'noluck' | null>(null);
  // READY locks the arrangement until RESET reopens the popup.
  const [locked, setLocked] = useState(false);
  // The round whose shuffle-and-deal animation is playing (manual arrangement opens when it ends).
  const [dealing, setDealing] = useState<number | null>(null);
  // The reveal show after you submit (Front → Middle → Back, then PUSOY! / ARAYYY KOOOO!), once per round.
  const [reveal, setReveal] = useState<{ id: number; plan: RevealPlan } | null>(null);
  // The reveal clock (ms into the show; Infinity when no show is playing).
  const now = useRevealClock(reveal?.plan ?? null, () => revealDone());

  // arrangement
  const [rows, setRows] = useState<Rows>(EMPTY);
  const [picked, setPicked] = useState<string[]>([]);
  // Your hand is shown in the order it was dealt until you choose to sort it.
  const [sortBy, setSortBy] = useState<'dealt' | 'rank' | 'suit'>('dealt');
  const [preview, setPreview] = useState<{ labels: Record<Lane, string | null>; is_foul: boolean } | null>(null);

  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const started = useRef(false);

  const say = useCallback((ok: boolean, text: string) => setToast({ ok, text }), []);

  // Out of Gold: the server has ended the match. Once the reveal show is over (played or skipped) the
  // result stays up for `leaving` ms, then you go Home (free Gold popup). null = not leaving.
  const [leaving, setLeaving] = useState<number | null>(null);
  const leaveOutOfGold = useCallback((delay: number) => setLeaving(delay), []);

  // The round whose cards are on the table right now. Async answers (e.g. the preview) for any other
  // round are dropped, so nothing from a previous round can be written into the current one.
  const roundIdRef = useRef<number | null>(null);

  /** Clear every piece of card-arrangement state: lanes, selection, preview, lock and the popup. */
  const clearCards = useCallback(() => {
    setRows(EMPTY);
    setPicked([]);
    setPreview(null);
    setLocked(false);
    setLuck(null);
    setDealing(null);
    setReveal(null);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);


  const newMatch = useCallback(async (t: PracticeTier) => {
    const r = await api<{ data: MatchState }>('/practice/matches', { method: 'POST', body: { tier: t.key } });
    setMatch(r.data);
    clearCards();
    roundIdRef.current = null;
    setRound(null);
    setPhase('betting');
    return r.data;
  }, [clearCards]);

  // ---- load: tier → resume the active match at this tier, or start a new one ----
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    const s = selectionFromUrl(window.location.search);
    if (!s) {
      router.replace(PICKER_URL);
      return;
    }
    saveSelection(s);

    (async () => {
      try {
        const [tiers, current] = await Promise.all([api<{ data: PracticeTier[]; meta?: { gold_wallet?: GoldWallet } }>('/practice/tiers'), api<{ data: MatchState | null }>('/practice/matches/current')]);
        // Out of Gold (and no round of yours still open): Single Player cannot continue.
        if (tiers.meta?.gold_wallet?.out_of_gold && !current.data?.current) {
          leaveOutOfGold(0);
          return;
        }
        const t = tiers.data.find((x) => x.key === s.tier);
        if (!t) {
          router.replace(PICKER_URL);
          return;
        }
        setTier(t);
        setBet(s.bet && t.bets.includes(s.bet) ? s.bet : t.bets[0]);

        if (current.data && current.data.tier.key === t.key) {
          setMatch(current.data);
          if (current.data.current) {
            clearCards();
            roundIdRef.current = current.data.current.id;
            setRound(current.data.current);
            setBet(current.data.current.bet);
            setPhase('arranging');
            setLocked(false);
            // Back to an open round: your cards in dealt order, rows to fill yourself.
            setLuck(EMPTY);
          } else {
            setPhase('betting');
          }
          return;
        }

        if (!t.eligible) {
          setPhase('betting');
          return;
        }
        await newMatch(t);
      } catch (e) {
        say(false, errorText(e));
        setPhase('betting');
      }
    })();
  }, [user, router, say, newMatch, clearCards, leaveOutOfGold]);

  // ---- bet + deal a round ----
  /** Place your bet (null when you are the banker: no bet, you cover the others) and deal. */
  const placeBet = async (amount: number | null) => {
    if (!tier || inFlight.current) return;
    if (!tier.eligible) {
      say(false, `Not enough gold for ${tier.name}. You need at least ${fmt(tier.min_gold)} gold.`);
      return;
    }
    inFlight.current = true;
    requestId.current = idempotencyKey();
    if (amount !== null) setBet(amount);
    setBusy(true);
    play('chip');
    try {
      const m = match && match.status === 'active' ? match : await newMatch(tier);
      const r = await api<{ data: RoundState }>(`/practice/matches/${m.id}/deal`, { method: 'POST', body: { ...(amount !== null ? { bet: amount } : {}), request_id: requestId.current } });
      saveSelection({ tier: tier.key, bet: amount ?? bet ?? undefined });
      // Start the new round from a clean card state: no lanes, selection, preview, lock or popup
      // from the previous round survive (the popup reopens below with only the new cards).
      clearCards();
      roundIdRef.current = r.data.id;
      setRound(r.data);
      setMatch((x) => (x ? { ...x, current: r.data, next_round: null, next_banker: null, next_banker_name: null } : x));
      setPhase('arranging');
      // The deal reserved Gold: every wallet display reloads from the server.
      window.dispatchEvent(new Event('pusoy:wallet'));
      // Play the shuffle-and-deal animation once per round (never again for the same round, e.g. on
      // a resume); manual arrangement opens only when it has finished (dealDone).
      if (firstShowing(r.data.id)) setDealing(r.data.id);
      else setLuck(EMPTY);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === 'out_of_gold') {
        leaveOutOfGold(0);
        return;
      }
      say(false, code === 'insufficient_gold' ? `Not enough gold for ${tier.name}. You need at least ${fmt(tier.min_gold)} gold.` : errorText(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  /** The deal animation finished (or was skipped): open manual arrangement with the cards in dealt order. */
  const dealDone = useCallback((id: number) => {
    setDealing((d) => (d === id ? null : d));
    if (roundIdRef.current === id) setLuck(EMPTY);
  }, []);

  /** The reveal show ended (or was skipped): show the final results and play the result sound. */
  const revealDone = () => {
    if (!reveal) return;
    setReveal(null);
    if (round) resultSound(round);
  };

  /** After a round settles: refresh the match (running Gold, standings, next banker, match end). */
  const settled = async (r: RoundState, show = false) => {
    // The round is over: drop its arrangement state (the reveal is drawn from the server's result).
    clearCards();
    roundIdRef.current = r.id;
    setRound(r);
    setPhase('revealed');
    // After a submit, play the reveal show once for this round (not under reduced motion); the
    // result sound then plays when it ends (revealDone).
    const plan = show && !reducedNow() && firstReveal(r.id) ? revealPlan(r.players, r.banker) : null;
    if (plan) setReveal({ id: r.id, plan });
    else resultSound(r);
    // The round settled: every wallet display reloads from the server.
    window.dispatchEvent(new Event('pusoy:wallet'));
    if (!match) return;
    try {
      const m = await api<{ data: MatchState }>(`/practice/matches/${match.id}`);
      setMatch(m.data);
      if (m.data.out_of_gold) leaveOutOfGold(2600);
      else if (m.data.status === 'completed') setTimeout(() => setPanel('summary'), 1600 + (plan?.done ?? 0));
    } catch {
      // the round result is already on screen
    }
  };

  // ---- Leave: the server ends the match (an unsubmitted round is void, its Gold reserve returned) ----
  const leaveTable = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (match && match.status === 'active') await leaveMatch(match.id);
    } catch {
      // still leave the screen; the match stays resumable on the server
    } finally {
      inFlight.current = false;
    }
    window.dispatchEvent(new Event('pusoy:wallet'));
    router.replace(PICKER_URL);
  };

  // ---- Declared Luck ----
  const declareLuck = async () => {
    if (!round || declaring || round.status !== 'arranging') return;
    setDeclaring(true);
    try {
      // The server checks your 13 cards and settles the round either way: a qualifying hand wins 2× bet,
      // a declaration without one loses 2× bet.
      const r = await api<{ data: RoundState }>(`/practice/${round.id}/lucky`, { method: 'POST' });
      setLuck(null);
      const failed = !!r.data.result?.lucky_failed;
      setNotice(failed ? 'noluck' : 'lucky');
      play(failed ? 'lose' : 'lucky');
      await settled(r.data);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_lucky') {
        setNotice('noluck');
        play('lose');
      } else {
        say(false, errorText(e));
      }
    } finally {
      setDeclaring(false);
    }
  };

  // ---- arranging ----
  const placed = useMemo(() => new Set([...rows.front, ...rows.middle, ...rows.back]), [rows]);
  const hand = useMemo(() => {
    const left = (round?.cards ?? []).filter((c) => !placed.has(c));
    return sortBy === 'dealt' ? left : sortCards(left, sortBy);
  }, [round, placed, sortBy]);
  const complete = rows.front.length === 3 && rows.middle.length === 5 && rows.back.length === 5;
  const foul = complete && !!preview?.is_foul;

  useEffect(() => {
    if (phase !== 'arranging' || !round) return undefined;
    let live = true;
    const id = round.id;
    const t = setTimeout(() => {
      api<{ data: { labels: Record<Lane, string | null>; is_foul: boolean } }>(`/practice/${id}/preview`, { method: 'POST', body: rows })
        // Ignore answers for older lanes or an earlier round.
        .then((r) => live && roundIdRef.current === id && setPreview(r.data))
        .catch(() => undefined);
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [rows, round, phase]);

  // Guard: whenever the round on the table changes, drop any card that is not in its hand.
  useEffect(() => {
    const mine = new Set(round?.cards ?? []);
    setRows((r) => (rowsUse(r, mine) ? r : EMPTY));
    setPicked((p) => p.filter((c) => mine.has(c)));
  }, [round?.id, round?.cards]);

  const moveTo = (cards: string[], zone: Zone) => {
    // After READY the arrangement is locked; Reset reopens the arrangement popup.
    if (locked) return;
    setRows((r) => {
      const next: Rows = { front: r.front.filter((c) => !cards.includes(c)), middle: r.middle.filter((c) => !cards.includes(c)), back: r.back.filter((c) => !cards.includes(c)) };
      if (zone !== 'hand') next[zone] = [...next[zone], ...cards.slice(0, SIZE[zone] - next[zone].length)];
      return next;
    });
    setPicked([]);
    play('deal');
  };

  /** RESET: unlock and reopen the arrangement popup with your own current rows (nothing is rearranged). */
  const reopen = () => {
    if (!round) return;
    play('tap');
    setLocked(false);
    setPicked([]);
    setLuck(rowsUse(rows, new Set(round.cards)) ? rows : EMPTY);
  };

  /**
   * SUBMIT is always available. A misplaced (fouled) arrangement is accepted
   * and the server applies the 2 × bet penalty; only an incomplete hand is
   * held back, with a hint.
   */
  const submit = async (lanes: Rows = rows) => {
    if (!round || busy) return;
    // Only this round's cards may be sent (never a card left over from an earlier round).
    if (!rowsUse(lanes, new Set(round.cards))) {
      clearCards();
      setLuck(EMPTY);
      say(false, 'Your cards were refreshed for this round — please arrange and submit again.');
      return;
    }
    const full = lanes.front.length === 3 && lanes.middle.length === 5 && lanes.back.length === 5;
    if (!full) {
      say(false, 'Place all 13 cards first — or tap Reset to arrange them.');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ data: RoundState }>(`/practice/${round.id}/submit`, { method: 'POST', body: lanes });
      await settled(r.data, true);
    } catch (e) {
      say(false, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const playNewMatch = async () => {
    if (!tier) return;
    setPanel(null);
    try {
      await newMatch(tier);
      play('tap');
    } catch (e) {
      say(false, errorText(e));
    }
  };

  const leave = () => {
    if (phase === 'arranging') {
      setPanel('leave');
      return;
    }
    play('tap');
    router.replace(PICKER_URL);
  };

  // ---- drag and drop on the stage: a real-feeling lifted card (useCardDrag), dropped into a row or the hand ----
  const zoneOf = (card: string): Zone => LANES.find((l) => rows[l].includes(card)) ?? 'hand';
  const { bind: bindDrag, dragging, ghost, suppressClick } = useCardDrag({
    enabled: !locked,
    resolve: ({ card, clientX, clientY }) => {
      const el = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest('[data-zone]') as HTMLElement | null;
      const zone = el?.dataset.zone as Zone | undefined;
      const from = zoneOf(card);
      const group = from === 'hand' && picked.includes(card) ? picked : [card];
      if (!zone || zone === from) return null;
      return { moved: group.filter((c) => c !== card), commit: () => moveTo(group, zone) };
    },
  });

  // ---- derived ----
  const players = round?.players ?? [];
  const me = players.find((p) => p.is_you);
  const revealed = phase === 'revealed';
  // The reveal show is playing for the round on the table.
  const revealing = !!reveal && revealed && round?.id === reveal.id;
  const fx = revealing ? fxAt(reveal.plan, now) : null;

  useEffect(() => {
    if (leaving === null || revealing) return undefined;
    const t = setTimeout(() => router.replace(OUT_OF_GOLD_URL), leaving);
    return () => clearTimeout(t);
  }, [leaving, revealing, router]);
  const name = user ? (user.display_name ?? user.name) : 'You';
  const shownBet = bet ?? tier?.bets[0] ?? 0;
  const bigCard = { w: 76, h: 106, f: 24 };
  // A match that ended because you ran out of Gold is over too: no more chips or deals.
  const matchOver = match?.status === 'completed' || match?.status === 'out_of_gold';
  const inRound = phase === 'arranging' || revealed;
  // The round on the table (or the next one while choosing a bet).
  const roundNo = inRound ? (round?.round ?? 1) : (match?.next_round ?? (match ? match.rounds_played + 1 : 1));
  const total = match?.rounds_total ?? 12;
  const banker = inRound ? (round?.banker ?? 1) : (match?.next_banker ?? bankerFor(roundNo));
  const canBet = !!tier && tier.eligible && !revealing && (phase === 'betting' || (revealed && !matchOver));
  // Who banks the round the chips (or Deal) are for.
  const nextBanker = revealed ? bankerFor(roundNo + 1) : banker;
  const result = round?.result;
  const outcomeText = (() => {
    if (!result || !round) return '';
    if (round.lucky) return `Declared Luck — ${round.lucky.label}`;
    if (result.lucky_failed) return round.banker === 1 ? 'Declared Luck failed — 2× bet to each player' : 'Declared Luck failed — 2× bet';
    if (result.misplaced) return round.banker === 1 ? 'Misplaced cards — 2× penalty to each player' : 'Misplaced cards — 2× penalty';
    if (round.banker === 1) {
      const bots = players.filter((p) => !p.is_you);
      const won = bots.filter((p) => (p.gold ?? 0) < 0).length;
      return `You banked · beat ${won} of 3`;
    }
    const bankerSeat = players.find((p) => p.is_banker);
    if (bankerSeat?.lucky) return `${bankerSeat.name} declared ${bankerSeat.lucky.label}`;
    if (!result.lanes) return '';
    const w = Object.values(result.lanes).filter((v) => v > 0).length;
    return `${w}-${3 - w} vs ${round.banker_name} · ${Math.abs(result.multiple ?? 0)}× bet`;
  })();

  const botStatus = (seat: number): ReactNode => {
    const p = players.find((x) => x.seat === seat);
    if (revealing) return <span className="text-[#7dffa0]">Submitted ✓</span>;
    if (revealed && p) {
      return (
        <span className={tone(p.gold ?? 0)}>
          {signed(p.gold ?? 0)}
          {p.lucky ? ` · ${p.lucky.label}` : ''}
        </span>
      );
    }
    if (phase === 'arranging' && dealing !== null) return <span className="text-white/80">Dealing…</span>;
    if (phase === 'arranging') return <span className="text-[#7dffa0]">Ready ✓{p && !p.is_banker ? ` · Bet ${fmt(p.bet)}` : ''}</span>;
    const s = match?.standings.find((x) => x.seat === seat);
    return s && match && match.rounds_played > 0 ? <span className={tone(s.gold)}>{signed(s.gold)}</span> : <span className="text-white/70">Waiting</span>;
  };

  return (
    <Screen title="Single Player" immersive>
      <LandscapeStage background={<LanternRoom className="h-full w-full" />}>
        <PokerTable />

        {/* Top-left controls + crest */}
        <RoundButton label="Back" x={20} onClick={leave}>
          <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
            <path d="M24 9 L12 20 L24 31 M12 20 H32" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </RoundButton>
        <RoundButton label="Settings" x={108} onClick={() => setPanel('settings')}>
          <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
            <g fill="currentColor">
              {Array.from({ length: 8 }, (_, i) => (
                <rect key={i} x="17" y="3" width="6" height="9" rx="2" transform={`rotate(${i * 45} 20 20)`} />
              ))}
              <circle cx="20" cy="20" r="11" />
            </g>
            <circle cx="20" cy="20" r="5" fill="#7a0a0e" />
          </svg>
        </RoundButton>
        <RoundButton label="How to play" x={196} onClick={() => setPanel('help')}>
          <span className="font-display text-[44px] font-black leading-none">?</span>
        </RoundButton>
        <div className="pointer-events-none absolute left-[290px] top-[4px] z-20">
          <MiniCrest />
        </div>

        {/* Your Gold wallet: Total Amount (live from the server) */}
        <GoldWalletHud wallet={goldWallet} className="absolute right-[365px] top-[12px] z-20" />

        {/* Bet pill + round / banker + match gold */}
        <div className="lx-gold absolute right-[20px] top-[18px] z-20 h-[76px] w-[330px] rounded-[24px] p-[5px] shadow-[0_6px_0_#7a3e00]">
          <div className="flex h-full items-center gap-2 rounded-[19px] bg-gradient-to-b from-[#b3141b] to-[#5a0609] px-3">
            <GoldCoins size={56} />
            <span className="flex-1 truncate text-center font-display text-[28px] font-black text-white drop-shadow-[0_2px_0_#3a0204]" aria-label="Current bet">
              {banker === 1 ? (inRound ? `Covering ${fmt(round?.covered ?? 0)}` : 'Banker · no bet') : `Bet: ${fmt(shownBet)} Gold`}
            </span>
          </div>
        </div>
        <div className="absolute right-[22px] top-[100px] z-20 flex flex-col items-end gap-1 font-display font-black">
          <span className="rounded-full bg-black/55 px-4 py-1 text-[22px] text-white" aria-label="Round">
            Round {Math.min(roundNo, total)} / {total} · <span className="text-[#ffe14d]">{banksText(banker)}</span>
          </span>
          {match && (
            <span className="rounded-full bg-black/45 px-4 py-0.5 text-[18px] text-white/90" aria-label="Match gold">
              {tier?.name} · Match <span className={tone(match.gold)}>{signed(match.gold)}</span>
            </span>
          )}
        </div>

        {/* The three bots */}
        {[2, 3, 4].map((seat) => {
          const s = SEATS[seat];
          const p = players.find((x) => x.seat === seat);
          return <SeatTile key={seat} avatar={BOT_AVATARS[seat]} name={BOTS[seat]} status={botStatus(seat)} banker={banker === seat} glow={revealed && !revealing && (p?.gold ?? 0) > 0} x={s.x} y={s.y} />;
        })}
        {phase === 'arranging' && dealing === null &&
          [2, 3, 4].map((seat) => (
            <div key={seat} className="pointer-events-none absolute" style={{ left: SEATS[seat].stack.x, top: SEATS[seat].stack.y }}>
              {[0, 1, 2].map((i) => (
                <PlayingCard key={i} faceDown className="absolute" style={{ left: i * 14, top: 0, width: 50, height: 70, transform: `rotate(${(i - 1) * 8}deg)` }} />
              ))}
            </div>
          ))}
        {revealed &&
          players
            .filter((p) => !p.is_you)
            .map((p) => (
              <div key={p.seat} className="absolute z-[5]" style={{ left: SEATS[p.seat].reveal.x, top: SEATS[p.seat].reveal.y }}>
                <RevealedHand p={p} card={{ w: 44, h: 62, f: 15 }} step={26} gap={SEATS[p.seat].horizontal ? 18 : 4} horizontal={SEATS[p.seat].horizontal} plan={reveal?.plan} now={now} hit={fx?.kind === 'zap' && fx.seat === p.seat} />
              </div>
            ))}

        {/* Felt centre */}
        {(phase === 'loading' || phase === 'betting') && (
          <div className="absolute left-[400px] top-[262px] z-[5] flex w-[800px] flex-col items-center text-center">
            {phase === 'loading' ? (
              <span className="mt-24 font-display text-[36px] font-black text-white/90" role="status">
                Setting up the table…
              </span>
            ) : (
              tier && (
                <>
                  <CandyText text={tier.name} width={640} height={100} size={80} sweepDelay={0.2} />
                  <p className="font-display text-[36px] font-black text-white drop-shadow-[0_3px_0_rgb(0_0_0/0.5)]">
                    Round {roundNo} of {total} · {banker === 1 ? 'You are the banker' : `${BOTS[banker]} is the banker`}
                  </p>
                  <p className="mt-1 font-display text-[28px] font-black text-[#ffe14d]">{tier.eligible ? (banker === 1 ? 'No bet needed — you cover the other players. Tap Deal.' : 'Tap a chip to place your bet and deal') : `You need at least ${fmt(tier.min_gold)} gold to play ${tier.name}`}</p>
                  <p className="mt-2 font-display text-[20px] font-bold text-white/70">4 players · every lane vs the banker · 3-0 pays 2× · 2-1 pays 1× · identical lane = banker wins</p>
                </>
              )
            )}
          </div>
        )}

        {phase === 'arranging' && round && dealing === null && (
          <>
            <div className="absolute left-[430px] top-[268px] z-[6] flex flex-col gap-[14px]">
              {LANES.map((lane) => {
                const size = SIZE[lane];
                const open = picked.length > 0 && rows[lane].length < size;
                return (
                  <div key={lane} className="flex items-center gap-3">
                    <span className="flex w-[118px] flex-col items-center">
                      <span className="rounded-full bg-gradient-to-b from-[#ffd34d] to-[#e08a00] px-3 py-0.5 font-display text-[19px] font-black uppercase text-[#4a1d00] shadow-[0_3px_0_#7a3e00]">{lane}</span>
                      <span className="mt-1 font-display text-[16px] font-black text-white/80">
                        {rows[lane].length}/{size}
                      </span>
                    </span>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${lane[0].toUpperCase()}${lane.slice(1)} row`}
                      data-zone={lane}
                      onClick={() => !suppressClick.current && picked.length > 0 && moveTo(picked, lane)}
                      onKeyDown={(e) => e.key === 'Enter' && picked.length > 0 && moveTo(picked, lane)}
                      className={`flex h-[122px] w-[436px] items-center gap-[8px] rounded-[18px] border-[3px] px-[8px] transition ${open ? 'border-[#ffe14d] bg-[#ffe14d]/15 shadow-[0_0_22px_rgb(255_225_77/0.55)]' : foul ? 'border-[#ff6b6b] bg-[#d81e3c]/15' : 'border-white/25 bg-black/20'}`}
                    >
                      {rows[lane].map((c) => (
                        <span key={c} data-card={c} onPointerDown={bindDrag(c)} className={`touch-none ${dragging === c ? 'opacity-0' : ''}`}>
                          <PlayingCard code={c} style={{ width: bigCard.w, height: bigCard.h, fontSize: bigCard.f }} onClick={() => !suppressClick.current && moveTo([c], 'hand')} />
                        </span>
                      ))}
                      {Array.from({ length: size - rows[lane].length }, (_, i) => (
                        <span key={i} className="shrink-0 rounded-[8px] border-[3px] border-dashed border-white/25" style={{ width: bigCard.w, height: bigCard.h }} />
                      ))}
                    </div>
                    <span className="w-[180px]">
                      {preview?.labels[lane] && <span className="whitespace-nowrap rounded-full bg-black/55 px-3 py-1 font-display text-[19px] font-black text-[#ffe14d]">{preview.labels[lane]}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            {(foul || locked) && (
              <div role="status" className={`absolute left-[480px] top-[690px] z-[6] rounded-full px-4 py-1 font-display text-[20px] font-black text-white ${foul ? 'bg-[#d81e3c]' : 'bg-black/55'}`}>
                {foul ? 'Misplaced cards — submitting now pays a 2× bet penalty. Tap Reset to fix.' : '🔒 Cards locked — tap Reset to rearrange'}
              </div>
            )}
            <button
              type="button"
              onClick={reopen}
              className="lx-tile absolute left-[1250px] top-[262px] z-[6] h-[60px] w-[150px] rounded-full border-[4px] border-white/60 bg-black/35 font-display text-[24px] font-black text-white"
            >
              Reset
            </button>
            {!luck && (
              <button
                type="button"
                onClick={declareLuck}
                disabled={declaring}
                className="lx-tile absolute left-[1222px] top-[400px] z-[6] flex h-[96px] w-[200px] items-center gap-1 rounded-full border-[4px] border-[#ffc531] bg-gradient-to-b from-[#a24dff] to-[#4a0f9a] pl-2 pr-3 shadow-[0_6px_0_#2a0660]"
              >
                <Clover size={62} />
                <span className="flex flex-col items-center font-display font-black leading-none">
                  <span className="text-[24px] text-white">{declaring ? 'Checking…' : 'Declared'}</span>
                  {!declaring && <span className="text-[26px] text-[#ffe14d]">Luck</span>}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => submit()}
              disabled={busy}
              className={`lx-tile absolute left-[1230px] top-[540px] z-[6] h-[88px] w-[190px] rounded-full border-[5px] font-display text-[32px] font-black text-white ${foul ? 'border-[#ffc2c2] bg-gradient-to-b from-[#ff6b6b] to-[#b3121a] shadow-[0_7px_0_#6b0606]' : 'border-[#c8ffd8] bg-gradient-to-b from-[#5ef08a] to-[#13a344] shadow-[0_7px_0_#0b6b2a]'} ${complete ? '' : 'opacity-80'}`}
            >
              {busy ? '…' : 'Submit'}
            </button>
          </>
        )}

        {revealed && me && (
          <>
            <div className="absolute left-[520px] top-[392px] z-[6]">
              <RevealedHand p={me} card={{ w: 58, h: 80, f: 19 }} step={40} gap={6} plan={reveal?.plan} now={now} hit={fx?.kind === 'zap' && fx.seat === me.seat} />
            </div>
            {result && !revealing && (
              <div className="absolute left-[880px] top-[430px] z-[6] flex w-[300px] flex-col items-center text-center" aria-label="Round result">
                <span className="font-display text-[22px] font-black text-white/85">Round {round?.round} · you</span>
                <span className={`font-display text-[56px] font-black leading-tight drop-shadow-[0_3px_0_rgb(0_0_0/0.5)] ${tone(result.gold)}`}>{signed(result.gold)}</span>
                <span className="font-display text-[22px] font-black text-[#ffe14d]">Gold</span>
                <span className="mt-1 font-display text-[20px] font-bold text-white/85">{outcomeText}</span>
                {!round?.wagering && <span className="mt-1 text-[15px] text-white/55">Practice Gold — not credited</span>}
              </div>
            )}
          </>
        )}

        {/* My seat: avatar + chips (betting / after a round) or the 13-card hand (arranging) */}
        <div className="absolute left-[300px] top-[752px] z-10 flex h-[140px] w-[1000px] items-center gap-4 rounded-[28px] border-[4px] border-[#ffc531] bg-gradient-to-b from-[#b3141b] to-[#5a0609] px-4 shadow-[0_8px_0_#3a0204]">
          <div className={`relative shrink-0 rounded-[16px] p-[5px] ${banker === 1 ? 'bg-gradient-to-b from-[#9fe0ff] to-[#1f6fe0] shadow-[0_0_20px_rgb(80_180_255/0.9)]' : 'lx-gold'}`} title={name} aria-label={`You${banker === 1 ? ' (banker)' : ''}`}>
            {banker === 1 && <BankerBadge />}
            <div className="overflow-hidden rounded-[11px] border-2 border-white/60">
              <Avatar name={name} avatar={user?.avatar} userId={user?.id} size={104} square rim={false} />
            </div>
          </div>

          {canBet && tier && nextBanker === 1 && (
            // You bank the next round: no bet — you cover the other players' bets.
            <div className="flex items-center gap-5">
              <button type="button" onClick={() => placeBet(null)} disabled={busy} className="lx-tile h-[96px] rounded-full border-[5px] border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] px-10 font-display text-[40px] font-black text-[#4a1d00] shadow-[0_7px_0_#8a4a00]">
                {busy ? 'Dealing…' : 'Deal'}
              </button>
              <span className="max-w-[460px] font-display text-[21px] font-black leading-tight text-white/85">
                {revealed ? `Round ${roundNo + 1}: you bank. ` : ''}You're the banker — no bet needed. You cover the other players' bets.
              </span>
            </div>
          )}

          {canBet && tier && nextBanker !== 1 && (
            <div className="flex items-center gap-5" role="group" aria-label="Bet chips">
              {tier.bets.map((b, i) => (
                <button
                  key={b}
                  type="button"
                  aria-label={`Bet ${fmt(b)}`}
                  aria-pressed={bet === b}
                  disabled={busy}
                  onClick={() => placeBet(b)}
                  className={`tb-chip rounded-full transition ${bet === b ? 'tb-chip-on' : ''}`}
                >
                  <Chip value={b >= 10000 ? `${b / 1000}K` : String(b)} color={CHIP_COLORS[i % 3]} size={108} />
                </button>
              ))}
              <span className="ml-1 max-w-[300px] font-display text-[21px] font-black leading-tight text-white/85">
                {busy ? 'Dealing…' : revealed ? `Round ${roundNo + 1}: ${bankerFor(roundNo + 1) === 1 ? 'you bank' : `${BOTS[bankerFor(roundNo + 1)]} banks`} — pick a bet` : 'Tap a chip to deal'}
              </span>
            </div>
          )}

          {(phase === 'betting' || phase === 'loading') && tier && !tier.eligible && <span className="font-display text-[26px] font-black text-white/80">Not enough gold for {tier.name}</span>}

          {/* Your hand on the table only when the arrangement popup is closed (no second card panel). */}
          {phase === 'arranging' && !luck && dealing === null && (
            <div data-zone="hand" className="relative h-[120px] flex-1" aria-label="Your hand">
              {hand.map((c, i) => {
                const on = picked.includes(c);
                return (
                  <span key={c} data-card={c} onPointerDown={bindDrag(c)} className={`absolute touch-none transition-[left] ${dragging === c ? 'opacity-0' : ''}`} style={{ left: i * Math.min(62, 760 / Math.max(hand.length, 1)), top: 8 }}>
                    <PlayingCard
                      code={c}
                      selected={on}
                      style={{ width: bigCard.w, height: bigCard.h, fontSize: bigCard.f }}
                      onClick={() => {
                        if (suppressClick.current || locked) return;
                        play('tap');
                        setPicked((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
                      }}
                    />
                  </span>
                );
              })}
              {hand.length === 0 && <span className="absolute inset-0 flex items-center font-display text-[26px] font-black text-[#7dffa0]">All cards placed — tap Submit!</span>}
            </div>
          )}

          {revealed && !revealing && matchOver && match && (
            <div className="flex flex-1 items-center justify-between">
              <span className="font-display text-[28px] font-black text-white">
                Match over · <span className={tone(match.gold)}>{signed(match.gold)} Gold</span>
              </span>
              <button type="button" onClick={() => setPanel('summary')} className="lx-tile h-[78px] rounded-full border-[5px] border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] px-8 font-display text-[30px] font-black text-[#4a1d00] shadow-[0_6px_0_#8a4a00]">
                Results
              </button>
            </div>
          )}
        </div>
        {/* Sort */}
        <div className="absolute right-[24px] top-[748px] z-10 flex flex-col items-end gap-3">
          <button
            type="button"
            aria-label={`Sort: ${sortBy === 'dealt' ? 'dealt order' : `by ${sortBy}`} — tap to change`}
            onClick={() => {
              setSortBy(sortBy === 'dealt' ? 'rank' : sortBy === 'rank' ? 'suit' : 'dealt');
              play('tap');
            }}
            disabled={phase !== 'arranging'}
            className="lx-tile flex h-[76px] w-[250px] items-center justify-center gap-3 rounded-[22px] border-[5px] border-[#ffc531] bg-gradient-to-b from-[#ff4a4a] to-[#b3141b] font-display text-[36px] font-black text-white shadow-[0_6px_0_#5a0609] disabled:opacity-50"
          >
            <svg viewBox="0 0 30 40" className="h-9 w-7" aria-hidden="true">
              <path d="M8 4 L2 12 H6 V24 H10 V12 H14Z M22 36 L28 28 H24 V16 H20 V28 H16Z" fill="currentColor" />
            </svg>
            Sort
            <span className="font-display text-[16px] font-bold text-white/80">{sortBy}</span>
          </button>
        </div>

        {/* Shuffle and deal (once per round), then the arrangement popup */}
        {dealing !== null && round && round.id === dealing && phase === 'arranging' && (
          <DealAnimation key={round.id} roundId={round.id} banker={round.banker} cards={round.cards} names={{ 1: 'You', ...BOTS }} onDone={() => dealDone(round.id)} />
        )}

        {/* Arrangement popup (after the deal): empty rows, your cards in dealt order */}
        {luck && round && phase === 'arranging' && rowsUse(luck, new Set(round.cards)) && (
          <LuckPopup
            key={round.id}
            gameId={round.id}
            initial={luck}
            cards={round.cards}
            tierName={`${round.tier.name} · R${round.round} · ${banksText(round.banker)}`}
            bet={round.bet}
            betLabel={round.banker === 1 ? `Covering ${fmt(round.covered ?? 0)}` : undefined}
            wallet={goldWallet}
            seats={{ left: { name: BOTS[2] }, right: { name: BOTS[4] } }}
            declaring={declaring}
            onDeclare={declareLuck}
            submitting={busy}
            onSubmit={(r) => {
              // SUBMIT in the popup sends these lanes to the server (a misplaced hand pays the 2× penalty).
              setRows(r);
              setPicked([]);
              submit(r);
            }}
          />
        )}

        {notice && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/55">
            <div role="alertdialog" aria-label={notice === 'lucky' ? 'Declared Luck' : 'No luck'} className={`sp-pop lx-gold relative w-[640px] rounded-[44px] p-[10px] shadow-[0_12px_0_#7a3e00] ${notice === 'lucky' ? 'tb-winner' : ''}`}>
              <div className={`flex flex-col items-center rounded-[36px] px-8 pb-8 pt-6 text-center ${notice === 'lucky' ? 'bg-[radial-gradient(circle_at_50%_25%,#b06bff,#4a0f9a_70%)]' : 'bg-[radial-gradient(circle_at_50%_25%,#8f1015,#3a0204_70%)]'}`}>
                <span className={notice === 'lucky' ? 'tb-clover-burst' : 'tb-sad'}>
                  <Clover size={150} sad={notice === 'noluck'} />
                </span>
                <CandyText text={notice === 'lucky' ? 'DECLARED LUCK!' : 'NO LUCK!'} width={580} height={110} size={notice === 'lucky' ? 72 : 92} stroke={notice === 'lucky' ? '#2a0660' : '#5a0606'} fill={notice === 'lucky' ? ['#fffbe0', '#ffe14d', '#ffa514'] : ['#ffffff', '#ffd0d0', '#ff8a8a']} />
                {notice === 'lucky' && round?.lucky ? (
                  <>
                    <p className="font-display text-[40px] font-black text-white">{round.lucky.label}</p>
                    <p className="mt-1 font-display text-[26px] font-bold text-white/85">Double winnings · {round.lucky.multiplier}× bet{round.banker === 1 ? ' from each bot' : ''}</p>
                    <p className={`mt-2 font-display text-[44px] font-black ${tone(result?.gold ?? 0)}`}>{signed(result?.gold ?? 0)} Gold</p>
                    {!round.wagering && <p className="text-[18px] text-white/60">Practice Gold — not credited</p>}
                  </>
                ) : result?.lucky_failed ? (
                  <>
                    <p className="font-display text-[26px] font-bold text-white/90">No Three Flushes, No Face Cards or Six Pairs in your 13 cards.</p>
                    <p className="mt-1 font-display text-[28px] font-black text-white">Declaration failed · 2× bet{round?.banker === 1 ? ' to each bot' : ''}</p>
                    <p className={`mt-2 font-display text-[44px] font-black ${tone(result.gold)}`}>{signed(result.gold)} Gold</p>
                    {!round?.wagering && <p className="text-[18px] text-white/60">Practice Gold — not credited</p>}
                  </>
                ) : (
                  <p className="font-display text-[28px] font-bold text-white/90">Your cards do not qualify for Declared Luck. Keep arranging and play the hand normally.</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    play('tap');
                    setNotice(null);
                  }}
                  className="lx-tile mt-6 h-[80px] w-[240px] rounded-full border-[5px] border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] font-display text-[40px] font-black text-[#4a1d00] shadow-[0_6px_0_#8a4a00]"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reveal show: centre banner, Skip, and the PUSOY! / ARAYYY KOOOO! effects */}
        {reveal && revealing && (
          <>
            <RevealBanner plan={reveal.plan} now={now} onSkip={revealDone} />
            <RevealFx fx={fx} />
          </>
        )}

        {/* Toast */}
        {/* Out of Gold: the match has ended; after the reveal you are taken back to Home. */}
        {leaving !== null && !revealing && (
          <div role="alert" aria-label="Out of Gold" className="sp-pop absolute left-1/2 top-[300px] z-50 -translate-x-1/2 rounded-[36px] border-[6px] border-[#ffe14d] bg-gradient-to-b from-[#7a1fd1] to-[#2a0758] px-14 py-6 text-center shadow-[0_10px_0_#7a3e00,0_0_60px_rgb(255_210_80/0.6)]">
            <p className="font-display text-[64px] font-black text-[#ffe14d] drop-shadow-[0_4px_0_rgb(0_0_0/0.5)]">Out of Gold!</p>
            <p className="font-display text-[28px] font-bold text-white/85">Single Player has ended. Returning to Home…</p>
          </div>
        )}

        {toast && (
          <div role="alert" className={`absolute left-1/2 top-[120px] z-50 -translate-x-1/2 whitespace-nowrap rounded-full border-4 px-8 py-3 font-display text-[26px] font-black shadow-lg ${toast.ok ? 'border-[#4ee36b] bg-[#0f2a1c] text-[#b9ffcb]' : 'border-[#ff8a8a] bg-[#3a0d14] text-[#ffe4e4]'}`}>
            {toast.text}
          </div>
        )}

        {/* Panels */}
        {panel && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55" onClick={() => setPanel(null)}>
            <div role="dialog" aria-label={{ settings: 'Settings', help: 'How to play', leave: 'Leave table', summary: 'Match results' }[panel]} onClick={(e) => e.stopPropagation()} className="lx-gold relative w-[900px] rounded-[40px] p-[10px] shadow-[0_12px_0_#7a3e00]">
              <div className="max-h-[840px] overflow-y-auto rounded-[32px] bg-gradient-to-b from-[#8f1015] to-[#3a0204] p-8 text-white">
                <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="absolute right-6 top-6 flex h-[60px] w-[60px] items-center justify-center rounded-full border-4 border-[#ffc531] bg-gradient-to-b from-[#ff6b6b] to-[#c0101a] font-display text-[30px] font-black">
                  ✕
                </button>

                {panel === 'settings' && (
                  <div className="space-y-5">
                    <h2 className="font-display text-[40px] font-black">Settings</h2>
                    <button type="button" role="switch" aria-checked={soundOn} onClick={() => savePrefs({ sfx: !soundOn })} className="flex w-full items-center justify-between rounded-2xl bg-black/30 px-6 py-4 font-display text-[28px] font-black">
                      Sound <span className={soundOn ? 'text-[#7dffa0]' : 'text-white/50'}>{soundOn ? 'ON' : 'OFF'}</span>
                    </button>
                    <Link href="/settings/" className="block rounded-2xl bg-black/30 px-6 py-4 font-display text-[28px] font-black">
                      More settings ›
                    </Link>
                  </div>
                )}

                {panel === 'help' && (
                  <div className="space-y-3 text-[22px] leading-snug">
                    <h2 className="font-display text-[40px] font-black">Round Bank Pusoy</h2>
                    <p>Four players — you, LuckyBot, CardBot and AceBot — for 12 rounds. The banker rotates: round 1 you, then LuckyBot, CardBot, AceBot, and around again.</p>
                    <p>The banker places no bet — it covers everyone else's bets. When you are not the banker, tap a chip to place your bet (each bot places its own); when you are, just tap Deal. Everyone gets 13 cards; arrange yours into <b className="text-[#ffe14d]">Front</b> (3), <b className="text-[#ffe14d]">Middle</b> (5) and <b className="text-[#ffe14d]">Back</b> (5). Back must be at least as strong as Middle, and Middle at least as strong as Front. Tap <b className="text-[#ffe14d]">READY</b> to lock your cards, <b className="text-[#ffe14d]">Reset</b> to rearrange, then <b className="text-[#ffe14d]">Submit</b>. A misplaced hand can still be submitted but pays a 2× bet penalty — to the banker, or as banker to every player.</p>
                    <p>Every player is compared with the banker lane by lane (Front vs Front, Middle vs Middle, Back vs Back). Win all 3 = 2× bet, win 2 = 1× bet; lose 2 = −1×, lose all 3 = −2×. <b className="text-[#ffe14d]">An identical lane goes to the banker.</b></p>
                    <p>Declared Luck: any ONE of Three Flushes (Front, Middle and Back each one suit), No Face Cards (no J, Q or K in your 13 cards) or Six Pairs. It beats the lane comparison and pays 2× bet; declaring without one loses 2× bet. The bots declare their own Lucky Hands.</p>
                    <p className="text-white/70">Nothing is arranged for you: your 13 cards go straight into Front, Middle and Back in the order they were dealt. Tap a card, then another card to swap them (or drag one onto another) until the rows are how you want them. Sort changes your hand's order on the table (dealt / rank / suit).</p>
                  </div>
                )}

                {panel === 'leave' && (
                  <div className="space-y-6 text-center">
                    <h2 className="font-display text-[40px] font-black">Leave the table?</h2>
                    <p className="text-[24px] text-white/85">Leaving ends this match. A round you have not submitted is cancelled and its reserved Gold goes back to your wallet.</p>
                    <div className="flex justify-center gap-4">
                      <button type="button" onClick={() => setPanel(null)} className="h-[72px] rounded-full border-4 border-white/60 bg-black/30 px-8 font-display text-[28px] font-black">
                        Stay
                      </button>
                      <button type="button" onClick={leaveTable} className="h-[72px] rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] px-8 font-display text-[28px] font-black text-[#4a1d00]">
                        Leave
                      </button>
                    </div>
                  </div>
                )}

                {panel === 'summary' && match && (
                  <div className="text-center">
                    {(() => {
                      const ranked = [...match.standings].sort((a, b) => b.gold - a.gold || a.seat - b.seat);
                      const place = ranked.findIndex((s) => s.seat === 1) + 1;
                      return (
                        <>
                          <span className="inline-block -rotate-2 rounded-2xl bg-gradient-to-b from-[#fff3a0] via-[#ffd13a] to-[#e08a00] px-8 py-2 font-display text-[44px] font-black text-[#4a1d00] shadow-[0_6px_0_#8a4a00]">{place === 1 ? 'YOU WIN THE MATCH!' : `#${place} PLACE`}</span>
                          <p className={`mt-3 font-display text-[40px] font-black ${tone(match.gold)}`}>{signed(match.gold)} Gold</p>
                          <p className="text-[18px] text-white/60">
                            {match.tier.name} · {match.rounds_total} rounds{match.wagering ? '' : ' · practice Gold — not credited'}
                          </p>
                          <ul className="mx-auto mt-3 max-w-[560px] space-y-1 text-left" aria-label="Standings">
                            {ranked.map((s, i) => (
                              <li key={s.seat} className={`flex items-center gap-4 rounded-2xl px-4 py-1.5 font-display text-[24px] font-black ${s.seat === 1 ? 'bg-[#ffd13a]/25 ring-2 ring-[#ffd13a]' : 'bg-black/30'}`}>
                                <span className="w-8 text-[#ffe14d]">{i === 0 ? '👑' : i + 1}</span>
                                <span className="flex-1">{s.seat === 1 ? name : s.name}</span>
                                <span className={tone(s.gold)}>{signed(s.gold)}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      );
                    })()}
                    <table className="mt-4 w-full text-left font-display text-[19px] font-black">
                      <thead className="text-white/60">
                        <tr>
                          <th className="px-2">Round</th>
                          <th className="px-2">Banker</th>
                          <th className="px-2 text-right">Bet</th>
                          <th className="px-2 text-right">You</th>
                          <th className="px-2 text-right">Gold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {match.history.map((h) => (
                          <tr key={h.round} className="odd:bg-black/20">
                            <td className="px-2">{h.round}</td>
                            <td className="px-2">{h.banker === 1 ? 'You' : h.banker_name}</td>
                            <td className="px-2 text-right">{h.banker === 1 ? `covered ${fmt(h.covered ?? 0)}` : fmt(h.bet)}</td>
                            <td className="px-2 text-right text-white/80">{h.lucky ? 'Lucky!' : h.banker === 1 ? 'Banked' : `${(h.multiple ?? 0) > 0 ? '+' : '−'}${Math.abs(h.multiple ?? 0)}×`}</td>
                            <td className={`px-2 text-right ${tone(h.gold)}`}>{signed(h.gold)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-5 flex justify-center gap-4">
                      <button type="button" onClick={() => router.replace(PICKER_URL)} className="h-[72px] rounded-full border-4 border-white/60 bg-black/30 px-7 font-display text-[26px] font-black">
                        Change level
                      </button>
                      <button type="button" onClick={playNewMatch} className="lx-tile h-[72px] rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] px-8 font-display text-[28px] font-black text-[#4a1d00] shadow-[0_6px_0_#8a4a00]">
                        New match
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* the card you are dragging (on the stage, same size as in its slot) */}
        {ghost}
      </LandscapeStage>
    </Screen>
  );
}
