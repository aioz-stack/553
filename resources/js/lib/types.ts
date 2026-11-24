export type Role = 'super_admin' | 'admin' | 'loader' | 'agent' | 'player';
/** GD = Gold (Single Player only), CH = Chips (Multiplayer only). */
export type Currency = 'GD' | 'CH';

export interface AuthUser {
  id: number;
  name: string;
  username: string;
  email: string;
  role: Role;
  role_label: string;
  abilities: string[];
  profile_picture?: string | null;
}

export interface SharedProps {
  auth: { user: AuthUser | null };
  flash: { success?: string | null; error?: string | null };
  features: Record<string, boolean>;
  reverb: { enabled: boolean };
  [key: string]: unknown;
}

export interface Wallet {
  id: number;
  currency: Currency;
  type: 'player' | 'allocation' | 'commission' | 'platform' | 'escrow';
  balance: string;
  balance_minor: number;
  is_frozen: boolean;
  owner?: { id?: number; name?: string; role?: string; system?: string };
}

export interface Transaction {
  id: number;
  reference: string;
  type: string;
  currency: Currency;
  amount: string;
  status: string;
  reason: string | null;
  direction: 'in' | 'out' | null;
  balance_before?: string;
  balance_after?: string;
  source?: string;
  destination?: string;
  created_at: string;
  game_session_id: number | null;
}

export interface Room {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  currency: Currency;
  entry_amount: string;
  payout_mode: 'round_bank' | 'winner_takes_all';
  platform_fee_bps: number;
  point_value: string | null;
  arrangement_seconds: number;
  tie_handling: string;
  timeout_policy: string;
  allow_foul_submission: boolean;
  visibility: 'public' | 'private';
  status: string;
  carry_over: string;
  invite_code?: string;
  waiting_players?: number;
  active_tables?: number;
  enabled: boolean;
  game_mode?: 'classic' | 'round_bank' | 'banker';
  game_mode_label?: string;
  rounds_total?: number;
  min_bet?: string;
  max_bet?: string | null;
  betting_seconds?: number;
  lucky_hands_enabled?: boolean;
  min_players?: number;
  is_hosted?: boolean;
}

export interface SeatPlayer {
  user_id: number;
  name: string;
  username?: string;
  seat: number;
  is_ready?: boolean;
  is_connected: boolean;
  is_you: boolean;
  has_submitted?: boolean;
}

export interface Arrangement {
  user_id: number;
  name: string;
  front: string[];
  middle: string[];
  back: string[];
  labels: { front: string; middle: string; back: string };
  is_foul: boolean;
  is_auto: boolean;
}

export interface Result {
  user_id: number;
  name: string;
  seat: number;
  score: number;
  placement: number;
  is_foul: boolean;
  hand_labels: { front: string; middle: string; back: string };
  entry: string;
  payout: string;
  net: string;
}

export interface SessionState {
  id: number;
  table_id: number;
  status: string;
  server_time: string;
  arrangement_deadline: string | null;
  seconds_remaining: number;
  deck_commitment: string;
  server_seed: string | null;
  config: {
    room_name: string;
    currency: Currency;
    entry_amount: string;
    payout_mode: string;
    platform_fee_bps: number;
    tie_handling: string;
    timeout_policy: string;
    allow_foul_submission: boolean;
    arrangement_seconds: number;
  };
  pot: string;
  players: SeatPlayer[];
  is_participant: boolean;
  my_cards: string[] | null;
  my_submission: { front: string[]; middle: string[]; back: string[]; is_auto: boolean } | null;
  arrangements: Arrangement[] | null;
  results: Result[] | null;
  cancel_reason: string | null;
}

export interface TableState {
  id: number;
  status: 'WAITING_FOR_PLAYERS' | 'READY' | 'IN_GAME' | 'CLOSED';
  full_at: string | null;
  room: { id: number; name: string; currency: Currency; entry_amount: string; payout_mode: string; arrangement_seconds: number };
  players: SeatPlayer[];
  current_session_id: number | null;
  ready_timeout_seconds: number;
  session?: SessionState;
}
