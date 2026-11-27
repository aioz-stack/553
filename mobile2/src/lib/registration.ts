/**
 * A registration link (…/register/player?ref=CODE or …/register/agent?ref=CODE) or its code.
 * Registration is only possible through a link; the server checks it again.
 */
export function parseRegistrationLink(input: string): { referral_code: string; account_type: 'player' | 'agent' } {
  const text = input.trim();
  const ref = text.match(/[?&]ref=([^&#\s]+)/i);
  return {
    referral_code: decodeURIComponent(ref ? ref[1] : text).trim().toUpperCase(),
    account_type: /\/register\/agent\b/i.test(text) ? 'agent' : 'player',
  };
}
