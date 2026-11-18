/**
 * Single Player difficulty selection, shared by the home picker and the
 * practice screen. The server owns the tier list and validates the chosen
 * tier/bet (and the player's gold) before dealing; this file only keeps the
 * player's last choice so it survives navigating between setup screens.
 */

export type TierKey = 'beginner' | 'intermediate' | 'advanced' | 'mastery' | (string & {});

export interface PracticeTier {
  key: TierKey;
  name: string;
  stars: number;
  crown: boolean;
  min_gold: number;
  bets: number[];
  eligible: boolean;
}

/** The chosen difficulty. `bet` is optional: the server defaults to the tier's lowest bet. */
export interface SinglePlayerSelection {
  tier: TierKey;
  bet?: number;
}

const KEY = 'pusoy.singlePlayer';

export function loadSelection(): SinglePlayerSelection | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SinglePlayerSelection>;
    if (typeof v.tier !== 'string') return null;
    return Number.isInteger(v.bet) && (v.bet as number) > 0 ? { tier: v.tier, bet: v.bet } : { tier: v.tier };
  } catch {
    return null;
  }
}

export function saveSelection(sel: SinglePlayerSelection): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(sel));
  } catch {
    // private mode / storage blocked: the URL still carries the selection
  }
}

/** Selection from the practice URL (?tier=&bet=), falling back to the saved one. */
export function selectionFromUrl(search: string): SinglePlayerSelection | null {
  const q = new URLSearchParams(search);
  const tier = q.get('tier');
  const bet = Number(q.get('bet'));
  if (tier) return Number.isInteger(bet) && bet > 0 ? { tier, bet } : { tier };
  return loadSelection();
}

/** Where tapping a difficulty card goes. */
export function practiceUrl(sel: SinglePlayerSelection): string {
  return `/practice/?tier=${encodeURIComponent(sel.tier)}${sel.bet ? `&bet=${sel.bet}` : ''}`;
}

/** Home with the Single Player picker open (used by "Change level"). */
export const PICKER_URL = '/home/?single=1';
