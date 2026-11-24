import { describe, expect, it } from 'vitest';
import { homePathFor, navigationFor } from './navigation';
import type { AuthUser } from './types';

const user = (role: AuthUser['role'], abilities: string[] = []): AuthUser => ({
  id: 1,
  name: 'Test',
  username: 'test',
  email: 't@example.test',
  role,
  role_label: role,
  abilities,
});

const hrefs = (u: AuthUser) => navigationFor(u).flatMap((g) => g.items.map((i) => i.href));

describe('role-specific navigation', () => {
  it('shows players only player pages', () => {
    const links = hrefs(user('player'));

    expect(links).toContain('/lobby');
    expect(links).toContain('/wallet');
    expect(links.some((h) => h.startsWith('/admin') || h.startsWith('/agent'))).toBe(false);
  });

  it('shows agents only agent pages', () => {
    const links = hrefs(user('agent'));

    expect(links).toContain('/agent/accounts/active-players');
    // No Register Player, Referral Codes or other retired agent tools.
    expect(links.some((h) => /\/agent\/(players|allocate|referral-codes|transactions|activity|reports)/.test(h))).toBe(false);
    expect(links.some((h) => h.startsWith('/admin') || h === '/lobby')).toBe(false);
  });

  it('filters administrator items by granted abilities', () => {
    const links = hrefs(user('admin', ['manage_rooms']));

    expect(links).toContain('/admin/rooms');
    expect(links).not.toContain('/admin/players');
    expect(links).not.toContain('/admin/administrators');
    expect(links).not.toContain('/admin/settings');
    expect(links).not.toContain('/crud');
  });

  it('gives super admins everything including super-admin-only pages', () => {
    const all = ['manage_players', 'manage_agents', 'allocate_points', 'manage_rooms', 'review_transactions', 'view_reports', 'manage_commissions', 'manage_games', 'view_audit_logs', 'freeze_allocations'];
    const links = hrefs(user('super_admin', all));

    expect(links).toEqual(expect.arrayContaining(['/admin/administrators', '/admin/settings', '/admin/audit-logs', '/admin/wallets?currency=CH', '/admin/wallets?currency=GD']));
  });

  it('drops empty groups and routes each role home', () => {
    expect(navigationFor(user('admin')).every((g) => g.items.length > 0)).toBe(true);
    expect(homePathFor(user('player'))).toBe('/dashboard');
    expect(homePathFor(user('agent'))).toBe('/agent');
    expect(homePathFor(user('admin'))).toBe('/admin');
    expect(navigationFor(null)).toEqual([]);
  });
});
