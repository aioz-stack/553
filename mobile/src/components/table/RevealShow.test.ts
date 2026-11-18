import { describe, expect, it } from 'vitest';
import { fxAt, isUp, laneShown, REVEAL, revealPlan, type RevealSeat } from './RevealShow';

const hand = (n: number) => ({
  front: [`${n}a`, `${n}b`, `${n}c`],
  middle: [`${n}d`, `${n}e`, `${n}f`, `${n}g`, `${n}h`],
  back: [`${n}i`, `${n}j`, `${n}k`, `${n}l`, `${n}m`],
});
const W = { front: 1, middle: 1, back: 1 };
const L = { front: -1, middle: -1, back: -1 };
const MIX = { front: 1, middle: -1, back: -1 };

describe('revealPlan', () => {
  // Banker CardBot (3); you lose all three lanes, LuckyBot sweeps the banker, AceBot misplaced.
  const seats: RevealSeat[] = [
    { seat: 1, is_banker: false, bet: 100, ...hand(1), lanes: L },
    { seat: 2, is_banker: false, bet: 50, ...hand(2), lanes: W },
    { seat: 3, is_banker: true, bet: 0, ...hand(3), lanes: null },
    { seat: 4, is_banker: false, bet: 500, ...hand(4), lanes: L, is_foul: true, misplaced: ['middle', 'back'] },
  ];
  const plan = revealPlan(seats, 3);

  it('reveals Front, then Middle, then Back — one card at a time, every seat, clockwise from after the banker', () => {
    const times = Object.entries(plan.flips).sort((a, b) => a[1] - b[1]);
    expect(times).toHaveLength(52);
    // all distinct moments: never two cards at once
    expect(new Set(times.map(([, t]) => t)).size).toBe(52);
    const lanesInOrder = times.map(([k]) => k.split(':')[1]);
    expect(lanesInOrder.slice(0, 12).every((l) => l === 'front')).toBe(true);
    expect(lanesInOrder.slice(12, 32).every((l) => l === 'middle')).toBe(true);
    expect(lanesInOrder.slice(32).every((l) => l === 'back')).toBe(true);
    // Front: AceBot (4) first, then You (1), LuckyBot (2), CardBot (3, the banker) last.
    expect(times.slice(0, 12).map(([k]) => Number(k.split(':')[0]))).toEqual([4, 4, 4, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
    expect(plan.flips['4:front:0']).toBe(REVEAL.intro);
    // Each lane's result shows after its last card has turned, before the next lane starts.
    expect(plan.lanes.front.result).toBeGreaterThan(plan.flips['3:front:2']);
    expect(plan.lanes.middle.start).toBeGreaterThan(plan.lanes.front.result);
  });

  it('PUSOY! bombs for lost-all-three (including a swept banker); ARAYYY KOOOO! for the misplaced hand, after the reveal', () => {
    expect(plan.fx.map((f) => [f.kind, f.seat, f.amount])).toEqual([
      ['bomb', 1, 200], // you: 0-3 → 2 × 100
      ['bomb', 3, 100], // the banker lost all three to LuckyBot: 2 × 50
      ['zap', 4, 1000], // AceBot misplaced: 2 × 500 (no bomb on top)
    ]);
    expect(plan.fx[0].t).toBeGreaterThanOrEqual(plan.lanes.back.result);
    expect(plan.fx[1].t).toBe(plan.fx[0].end);
    expect(plan.done).toBeGreaterThan(plan.fx[2].end);
  });

  it('no effects when nobody lost all three lanes or misplaced; a misplaced banker pays every player', () => {
    expect(revealPlan([
      { seat: 1, is_banker: true, bet: 0, ...hand(1), lanes: null },
      { seat: 2, is_banker: false, bet: 50, ...hand(2), lanes: MIX },
    ], 1).fx).toEqual([]);
    const bank = revealPlan([
      { seat: 1, is_banker: true, bet: 0, ...hand(1), lanes: null, is_foul: true },
      { seat: 2, is_banker: false, bet: 50, ...hand(2), lanes: W },
      { seat: 3, is_banker: false, bet: 100, ...hand(3), lanes: W },
    ], 1);
    expect(bank.fx.map((f) => [f.kind, f.seat, f.amount])).toEqual([['zap', 1, 300]]);
  });

  it('clock helpers: face down before the flip, lane result after, effect while playing; no plan = all shown', () => {
    expect(isUp(plan, plan.flips['1:back:4'] - 1, 1, 'back', 4)).toBe(false);
    expect(isUp(plan, plan.flips['1:back:4'], 1, 'back', 4)).toBe(true);
    expect(laneShown(plan, plan.lanes.middle.result - 1, 'middle')).toBe(false);
    expect(fxAt(plan, plan.fx[2].t + 10)?.kind).toBe('zap');
    expect(isUp(null, 0, 1, 'front', 0)).toBe(true);
    expect(laneShown(null, 0, 'front')).toBe(true);
  });
});
