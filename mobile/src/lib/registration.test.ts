import { describe, expect, it } from 'vitest';
import { parseRegistrationLink } from './registration';

describe('parseRegistrationLink', () => {
  it('reads the code and type from a full link', () => {
    expect(parseRegistrationLink('https://example.test/register/agent?ref=abc123')).toEqual({ referral_code: 'ABC123', account_type: 'agent' });
    expect(parseRegistrationLink(' https://example.test/register/player?ref=XyZ&x=1 ')).toEqual({ referral_code: 'XYZ', account_type: 'player' });
  });

  it('accepts a bare code as a player registration', () => {
    expect(parseRegistrationLink('pq7k2')).toEqual({ referral_code: 'PQ7K2', account_type: 'player' });
  });
});
