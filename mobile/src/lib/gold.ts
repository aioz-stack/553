import { api, idempotencyKey } from './api';

/**
 * Single Player Gold Wallet (server: App\Services\Game\GoldService). Gold is
 * won and lost automatically by every settled Single Player round; Gold
 * Points are the free Out of Gold reward, converted one way (1:1) into Gold.
 * Both are free-play and never mix with CP or VC. Every balance change is made
 * on the server; the app only displays it.
 */
export interface GoldWallet {
  gold: string;
  gold_points: string;
  /** Gold can no longer cover the next round (mid-match) or the Beginner minimum. */
  out_of_gold: boolean;
  claim_amount: number;
  /** Out of Gold and no unconverted claim waiting. */
  can_claim: boolean;
  minimum_to_start: number;
}

/** Home with the Out of Gold popup (where Single Player sends you when you run out). Single Player only. */
export const OUT_OF_GOLD_URL = '/home/?gold=out';

export function fetchGold(): Promise<GoldWallet> {
  return api<{ data: GoldWallet }>('/practice/gold').then((r) => r.data);
}

/** Claim the free Gold Points (the server checks eligibility and credits it once). */
export function claimGoldPoints(): Promise<{ message: string; data: GoldWallet & { reference: string } }> {
  return api('/practice/gold/claim', { method: 'POST' });
}

/** Convert all Gold Points into Gold (1:1). `requestId` makes a retried request convert once. */
export function convertGoldPoints(requestId: string = idempotencyKey().replace(/[^A-Za-z0-9-]/g, '')): Promise<{ message: string; data: GoldWallet & { converted: string } }> {
  return api('/practice/gold/convert', { method: 'POST', body: { request_id: requestId } });
}

/** Tell every balance display to reload (Gold / Gold Points changed). */
export function walletChanged(): void {
  window.dispatchEvent(new Event('pusoy:wallet'));
}
