import { describe, expect, it } from 'vitest';
import { percentFromBps, points, titleCase } from './format';
import { sortCards } from '../Components/PlayingCard';

describe('formatting helpers', () => {
  it('formats points with two decimals and currency', () => {
    expect(points('1250.5', 'VC')).toMatch(/^1,250\.50 VC$/);
    expect(points(null)).toBe('0.00');
  });

  it('converts basis points and enum names', () => {
    expect(percentFromBps(500)).toBe('5%');
    expect(percentFromBps(4050)).toBe('40.50%');
    expect(titleCase('WINNER_TAKES_ALL')).toBe('Winner Takes All');
  });

  it('sorts cards by rank or suit without evaluating hands', () => {
    expect(sortCards(['2C', 'AS', 'TD', 'KH'])).toEqual(['AS', 'KH', 'TD', '2C']);
    expect(sortCards(['2C', 'AS', '3S', 'KH'], 'suit')).toEqual(['AS', '3S', 'KH', '2C']);
  });
});
