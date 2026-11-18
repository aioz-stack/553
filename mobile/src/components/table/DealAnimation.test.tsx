import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DealAnimation, { cardKeys, dealOrder, landsAt, PHASES, phaseAt } from './DealAnimation';

const MINE = ['2C', '3D', '4H', '5S', '6C', '7D', '8H', '9S', 'TC', 'JD', 'QH', 'KS', 'AC'];
const NAMES = { 1: 'You', 2: 'LuckyBot', 3: 'CardBot', 4: 'AceBot' };

describe('deal order', () => {
  it('starts with the seat after the banker and ends on the banker, clockwise', () => {
    expect(dealOrder(1)).toEqual([2, 3, 4, 1]);
    expect(dealOrder(2)).toEqual([3, 4, 1, 2]);
    expect(dealOrder(3)).toEqual([4, 1, 2, 3]);
    expect(dealOrder(4)).toEqual([1, 2, 3, 4]);
  });

  it('runs every phase in the required order, one card at a time', () => {
    const seq = ['gather', 'form', 'split', 'riffle', 'merge', 'ready', 'deal', 'complete'] as const;
    const starts = seq.map((p) => PHASES[p]);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    seq.forEach((p) => expect(phaseAt(PHASES[p])).toBe(p));
    // Distribution only starts after the shuffle is squared; cards land one after another.
    expect(PHASES.deal).toBeGreaterThan(PHASES.ready);
    for (let p = 1; p < 52; p++) expect(landsAt(p)).toBeGreaterThan(landsAt(p - 1));
    expect(landsAt(51)).toBeLessThan(PHASES.complete);
  });

  it('builds a time-ordered keyframe track for all 52 cards, each landing in its seat fan', () => {
    for (let p = 0; p < 52; p++) {
      const keys = cardKeys(p, 3, 42);
      for (let i = 1; i < keys.length; i++) expect(keys[i].t).toBeGreaterThanOrEqual(keys[i - 1].t);
      expect(keys[keys.length - 1].t).toBe(PHASES.done);
    }
  });
});

describe('DealAnimation', () => {
  const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    localStorage.setItem('pusoy.motion', 'on');
    (HTMLElement.prototype as unknown as { animate: typeof animate }).animate = animate;
    animate.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.removeItem('pusoy.motion');
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  it('animates all 52 cards, counts 13 per seat and only then hands over to arrangement', () => {
    const done = vi.fn();
    render(<DealAnimation roundId={7} banker={2} cards={MINE} names={NAMES} onDone={done} />);

    // 52 cards (+ their shadows when the device can afford them) + the camera.
    expect(animate.mock.calls.length).toBeGreaterThanOrEqual(53);
    expect(screen.getByText('Gathering the cards…')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(PHASES.riffle + 10));
    expect(screen.getByText('Riffle shuffle…')).toBeInTheDocument();
    expect(done).not.toHaveBeenCalled();

    // Banker is LuckyBot (2): CardBot (3) gets the first card.
    act(() => vi.advanceTimersByTime(landsAt(0) - PHASES.riffle));
    expect(screen.getByText('Dealing clockwise from CardBot…')).toBeInTheDocument();
    expect(screen.getByLabelText('CardBot cards')).toHaveTextContent('1');
    expect(screen.getByLabelText('LuckyBot cards')).toHaveTextContent('0');

    act(() => vi.advanceTimersByTime(PHASES.complete - landsAt(0)));
    for (const n of Object.values(NAMES)) expect(screen.getByLabelText(`${n} cards`)).toHaveTextContent('13');
    expect(done).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(PHASES.done - PHASES.complete));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('turns over only your own server-dealt cards; Skip hands over once', () => {
    const done = vi.fn();
    const { container } = render(<DealAnimation roundId={8} banker={1} cards={MINE} names={NAMES} onDone={done} />);
    // Faces exist only for your 13 cards, in the order you received them.
    const faces = Array.from(container.querySelectorAll('[data-deal-card]')).filter((el) => el.children.length > 1);
    expect(faces).toHaveLength(13);
    expect(faces[0]).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    act(() => vi.advanceTimersByTime(PHASES.done));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('finishes at once with reduced motion', () => {
    localStorage.setItem('pusoy.motion', 'off');
    const done = vi.fn();
    render(<DealAnimation roundId={9} banker={1} cards={MINE} names={NAMES} onDone={done} />);
    expect(done).toHaveBeenCalledTimes(1);
    expect(animate).not.toHaveBeenCalled();
  });
});
