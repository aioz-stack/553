import { describe, expect, it } from 'vitest';
import { chipsFor, toCents, validateAmount, type RevenueSummary } from './RevenueConvert';

const summary = (available: string): RevenueSummary => ({
  total_revenue: '100.00',
  available_revenue: available,
  my_chips: '0.00',
  chips_to_receive: available,
  min_amount: '20.00',
  rate: '1 Revenue = 1 Chip',
  rate_bps: 10000,
  converted_total: '0.00',
  can_convert: true,
  recent: [],
});

describe('Self Convert Revenue to Chips: amount validation', () => {
  it('parses amounts to cents (up to 2 decimals only)', () => {
    expect(toCents('20')).toBe(2000);
    expect(toCents('20.5')).toBe(2050);
    expect(toCents('20.05')).toBe(2005);
    expect(toCents('20.555')).toBeNull();
    expect(toCents('abc')).toBeNull();
    expect(toCents('-5')).toBeNull();
    expect(toCents('1e3')).toBeNull();
  });

  it('requires at least the minimum (20) and at most the Available Revenue', () => {
    const s = summary('45.50');
    expect(validateAmount('', s).ok).toBe(false);
    expect(validateAmount('19.99', s)).toMatchObject({ ok: false, error: expect.stringContaining('minimum') });
    expect(validateAmount('45.51', s)).toMatchObject({ ok: false, error: expect.stringContaining('Available Revenue') });
    expect(validateAmount('x', s)).toMatchObject({ ok: false, error: expect.stringContaining('valid number') });
    expect(validateAmount('20', s)).toEqual({ ok: true, value: '20', cents: 2000 });
    expect(validateAmount('45.50', s)).toEqual({ ok: true, value: '45.50', cents: 4550 });
  });

  it('cannot convert when the Available Revenue is below the minimum', () => {
    expect(validateAmount('20', summary('10.00')).ok).toBe(false);
    expect(validateAmount('20', undefined).ok).toBe(false);
  });

  it('shows the Chips at the configured rate', () => {
    expect(chipsFor(2050, 10000)).toBe(2050);
    expect(chipsFor(2500, 15000)).toBe(3750);
  });
});
