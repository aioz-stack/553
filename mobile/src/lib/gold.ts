import { api, idempotencyKey } from './api';

/**
 * Single Player Gold Wallet (server: App\Services\Game\GoldService). Gold is
 * Single Player only: won and lost automatically by every settled round, and
 * refilled by the free Out of Gold claim. It never mixes with Chips (the
 * Multiplayer currency). Every balance change is made on the server; the app
 * only displays it.
 */
export interface GoldWallet {
  /** Spendable Gold. */
  gold: string;
  /** Gold held for the round you are playing. */
  reserved?: string;
  /** Total Amount: spendable + reserved Gold. */
  total?: string;
  /** Gold can no longer cover the next round (mid-match) or the Beginner minimum. */
  out_of_gold: boolean;
  claim_amount: number;
  /** Out of Gold: the free Gold can be claimed. */
  can_claim: boolean;
  minimum_to_start: number;
}

/** Home with the Out of Gold popup (where Single Player sends you when you run out). Single Player only. */
export const OUT_OF_GOLD_URL = '/home/?gold=out';

/** A request id the server accepts (letters, digits and dashes). */
export const requestKey = () => idempotencyKey().replace(/[^A-Za-z0-9-]/g, '');

export function fetchGold(): Promise<GoldWallet> {
  return api<{ data: GoldWallet }>('/practice/gold').then((r) => r.data);
}

/**
 * Claim the free Gold straight into the Gold wallet. The server checks you are Out of Gold;
 * `requestId` (one per popup) makes repeated clicks and retries return the same claim.
 */
export function claimGold(requestId: string): Promise<{ message: string; data: GoldWallet & { reference: string } }> {
  return api('/practice/gold/claim', { method: 'POST', body: { request_id: requestId } });
}

/** Leave Single Player: the server ends the match; an unsubmitted round is void and its Gold reserve returned. */
export function leaveMatch(matchId: number): Promise<{ data: { status: string; gold_wallet: GoldWallet } }> {
  return api(`/practice/matches/${matchId}/leave`, { method: 'POST' });
}

/** Tell every balance display to reload (Gold or Chips changed). */
export function walletChanged(): void {
  window.dispatchEvent(new Event('pusoy:wallet'));
}
