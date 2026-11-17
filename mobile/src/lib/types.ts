/** Shapes returned by the Laravel API (mirrors the web app's types). */
export type Currency = 'CP' | 'VC';

export interface User {
  id: number;
  name: string;
  username: string;
  email?: string;
  role: 'super_admin' | 'admin' | 'agent' | 'player';
  role_label: string;
  display_name?: string | null;
}

export interface Wallet {
  id: number;
  currency: Currency;
  type: string;
  balance: string;
  is_frozen: boolean;
}

export interface Transaction {
  id: number;
  reference: string;
  type: string;
  currency: Currency;
  amount: string;
  direction: 'in' | 'out' | null;
  balance_after?: string;
  reason: string | null;
  created_at: string;
}

export interface Room {
  id: number;
  name: string;
  description: string | null;
  currency: Currency;
  entry_amount: string;
  payout_mode: string;
  platform_fee_bps: number;
  arrangement_seconds: number;
  tie_handling: string;
  carry_over: string;
  waiting_players?: number;
  enabled: boolean;
  visibility: string;
  invite_code?: string;
}

export interface SeatPlayer {
  user_id: number;
  name: string;
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
  deck_commitment: string;
  server_seed: string | null;
  config: { room_name: string; currency: Currency; entry_amount: string; payout_mode: string; allow_foul_submission: boolean; arrangement_seconds: number };
  pot: string;
  players: SeatPlayer[];
  my_cards: string[] | null;
  my_submission: { front: string[]; middle: string[]; back: string[] } | null;
  arrangements: Arrangement[] | null;
  results: Result[] | null;
  cancel_reason: string | null;
}

export interface TableState {
  id: number;
  status: string;
  room: { id: number; name: string; currency: Currency; entry_amount: string; payout_mode: string };
  players: SeatPlayer[];
  current_session_id: number | null;
  ready_timeout_seconds: number;
  session?: SessionState;
}
