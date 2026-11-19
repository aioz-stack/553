import type { ComponentType, SVGProps } from 'react';
import { IconGrid, IconUsers } from '../Components/Icons';
import {
  IconBell,
  IconCards,
  IconChart,
  IconCoins,
  IconLink,
  IconList,
  IconSettings,
  IconShield,
  IconTable,
  IconTrophy,
  IconUser,
  IconWallet,
} from '../Components/PlatformIcons';
import type { AuthUser } from './types';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  ability?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const player: NavGroup[] = [
  {
    title: 'PLAY',
    items: [
      { key: 'dashboard', label: 'DASHBOARD', href: '/dashboard', icon: IconGrid },
      { key: 'lobby', label: 'GAME LOBBY', href: '/lobby', icon: IconCards },
      { key: 'rooms', label: 'GAME ROOMS', href: '/rooms', icon: IconTable },
      { key: 'history', label: 'GAME HISTORY', href: '/history', icon: IconList },
      { key: 'leaderboard', label: 'LEADERBOARD', href: '/leaderboard', icon: IconTrophy },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { key: 'wallet', label: 'WALLET', href: '/wallet', icon: IconWallet },
      { key: 'transactions', label: 'TRANSACTIONS', href: '/transactions', icon: IconCoins },
      { key: 'notifications', label: 'NOTIFICATIONS', href: '/notifications', icon: IconBell },
      { key: 'profile', label: 'PROFILE', href: '/profile', icon: IconUser },
      { key: 'settings', label: 'SETTINGS', href: '/settings', icon: IconSettings },
    ],
  },
];

const agent: NavGroup[] = [
  {
    title: 'AGENT',
    items: [
      { key: 'agent', label: 'OVERVIEW', href: '/agent', icon: IconGrid },
      { key: 'agent-players', label: 'MY PLAYERS', href: '/agent/players', icon: IconUsers },
      { key: 'agent-register', label: 'REGISTER PLAYER', href: '/agent/players/create', icon: IconUser },
      { key: 'agent-referrals', label: 'REFERRAL CODES', href: '/agent/referral-codes', icon: IconLink },
      { key: 'agent-allocate', label: 'POINT ALLOCATION', href: '/agent/allocate', icon: IconCoins },
      { key: 'agent-balances', label: 'ALLOCATION BALANCES', href: '/agent/balances', icon: IconWallet },
      { key: 'agent-transactions', label: 'TRANSACTIONS', href: '/agent/transactions', icon: IconList },
      { key: 'agent-activity', label: 'PLAYER ACTIVITY', href: '/agent/activity', icon: IconCards },
      { key: 'agent-commissions', label: 'COMMISSIONS', href: '/agent/commissions', icon: IconTrophy },
      { key: 'agent-reports', label: 'REPORTS', href: '/agent/reports', icon: IconChart },
      { key: 'profile', label: 'PROFILE', href: '/profile', icon: IconUser },
    ],
  },
];

const staff: NavGroup[] = [
  {
    title: 'PLATFORM',
    items: [
      { key: 'admin', label: 'OVERVIEW', href: '/admin', icon: IconGrid },
      { key: 'admin-administrators', label: 'ADMINISTRATORS', href: '/admin/administrators', icon: IconShield, ability: 'super_admin' },
      { key: 'admin-agents', label: 'AGENTS', href: '/admin/agents', icon: IconUsers, ability: 'manage_agents' },
      { key: 'admin-players', label: 'PLAYERS', href: '/admin/players', icon: IconUser, ability: 'manage_players' },
    ],
  },
  {
    title: 'GAMES',
    items: [
      { key: 'admin-rooms', label: 'GAME ROOMS', href: '/admin/rooms', icon: IconTable, ability: 'manage_rooms' },
      { key: 'admin-tables', label: 'ACTIVE TABLES', href: '/admin/tables', icon: IconCards, ability: 'manage_games' },
      { key: 'admin-sessions', label: 'GAME SESSIONS', href: '/admin/sessions', icon: IconList, ability: 'manage_games' },
    ],
  },
  {
    title: 'ECONOMY',
    items: [
      { key: 'admin-wallets', label: 'WALLET MANAGEMENT', href: '/admin/wallets', icon: IconWallet, ability: 'review_transactions' },
      { key: 'admin-chips', label: 'CHIPS MANAGEMENT', href: '/admin/wallets?currency=CH', icon: IconCoins, ability: 'review_transactions' },
      { key: 'admin-gold', label: 'GOLD MANAGEMENT', href: '/admin/wallets?currency=GD', icon: IconCoins, ability: 'review_transactions' },
      { key: 'admin-allocations', label: 'ALLOCATIONS', href: '/admin/allocations', icon: IconCoins, ability: 'allocate_points' },
      { key: 'admin-transactions', label: 'TRANSACTIONS', href: '/admin/transactions', icon: IconList, ability: 'review_transactions' },
      { key: 'admin-commissions', label: 'COMMISSIONS', href: '/admin/commissions', icon: IconTrophy, ability: 'manage_commissions' },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { key: 'admin-reports', label: 'REPORTS', href: '/admin/reports', icon: IconChart, ability: 'view_reports' },
      { key: 'admin-audit', label: 'AUDIT LOGS', href: '/admin/audit-logs', icon: IconShield, ability: 'view_audit_logs' },
      { key: 'admin-settings', label: 'SYSTEM SETTINGS', href: '/admin/settings', icon: IconSettings, ability: 'super_admin' },
      { key: 'admin-users', label: 'BASEPLATE USERS', href: '/crud', icon: IconUsers, ability: 'super_admin' },
      { key: 'profile', label: 'PROFILE', href: '/profile', icon: IconUser },
    ],
  },
];

export function navigationFor(user: AuthUser | null): NavGroup[] {
  if (!user) {
    return [];
  }

  const groups = user.role === 'player' ? player : user.role === 'agent' ? agent : staff;

  const allowed = (item: NavItem) => {
    if (!item.ability) {
      return true;
    }

    if (item.ability === 'super_admin') {
      return user.role === 'super_admin';
    }

    return user.abilities.includes(item.ability);
  };

  return groups
    .map((group) => ({ ...group, items: group.items.filter(allowed) }))
    .filter((group) => group.items.length > 0);
}

export function homePathFor(user: AuthUser | null): string {
  if (!user) {
    return '/';
  }

  return user.role === 'player' ? '/dashboard' : user.role === 'agent' ? '/agent' : '/admin';
}
