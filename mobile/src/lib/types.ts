/** Shapes returned by the Laravel API (mirrors the web app's types). */
/** The game's only two currencies: GD = Gold (Single Player only), CH = Chips (Multiplayer only). Never mixed. */
export type Currency = 'GD' | 'CH';

export interface User {
  id: number;
  name: string;
  /** Cartoon avatar id (lib/avatars). */
  avatar?: string | null;
  username: string;
  email?: string;
  role: 'super_admin' | 'admin' | 'agent' | 'player';
  role_label: string;
  display_name?: string | null;
  level?: Level;
  /** Your saved game settings (only on your own record). */
  preferences?: { bgm: boolean; sfx: boolean; motion: 'low' | 'medium' | 'high' };
}

export interface Level {
  level: number;
  xp: number;
  into_level: number;
  for_next: number;
}

export type GameMode = 'classic' | 'round_bank' | 'banker';

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
  game_mode: GameMode;
  game_mode_label: string;
  rounds_total: number;
  min_bet: string;
  max_bet: string;
  betting_seconds: number;
  lucky_hands_enabled: boolean;
  is_hosted: boolean;
  host?: { id: number; username: string; name: string };
  seated_players?: number;
}

export interface SeatPlayer {
  user_id: number;
  name: string;
  /** Cartoon avatar id (lib/avatars). */
  avatar?: string | null;
  seat: number;
  is_ready?: boolean;
  is_connected: boolean;
  is_you: boolean;
  has_submitted?: boolean;
  is_banker?: boolean;
  bet?: string | null;
  declared_lucky?: boolean;
  banker_rounds?: number;
}

export interface Arrangement {
  user_id: number;
  name: string;
  avatar?: string | null;
  front: string[];
  middle: string[];
  back: string[];
  labels: { front: string; middle: string; back: string };
  is_foul: boolean;
  is_auto: boolean;
  lucky_type?: string | null;
}

export interface Result {
  user_id: number;
  name: string;
  /** Cartoon avatar id (lib/avatars). */
  avatar?: string | null;
  seat: number;
  score: number;
  placement: number;
  is_foul: boolean;
  entry: string;
  payout: string;
  net: string;
  role?: 'banker' | 'player' | null;
  bet?: string;
  lanes?: { front: number; middle: number; back: number } | null;
  lucky_type?: string | null;
  lucky_bonus?: string;
  fee?: string;
}

export interface Standing {
  rank: number;
  user_id: number;
  name: string;
  /** Cartoon avatar id (lib/avatars). */
  avatar?: string | null;
  rounds: number;
  won: number;
  lost: number;
  tied: number;
  banker_rounds: number;
  lucky: number;
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
  config: {
    room_name: string;
    currency: Currency;
    entry_amount: string;
    payout_mode: string;
    allow_foul_submission: boolean;
    arrangement_seconds: number;
    game_mode?: GameMode;
    rounds_total?: number;
    min_bet?: string;
    max_bet?: string;
    betting_seconds?: number | null;
    lucky_hands_enabled?: boolean;
    /** Lobbies: the only permitted bets (5 / 10 / 15 % of the Minimum Entry, 1:1). */
    bet_chips?: string[] | null;
    min_entry?: string | null;
    /** Chips a player must hold to bank (6 × the maximum bet). */
    banker_reserve?: string | null;
  };
  /** Clockwise seat order of the match. */
  seat_order?: Array<{ user_id: number; seat: number }> | null;
  /** This round's banker choice: who was checked (clockwise) and whether they held the banker reserve. */
  banker_selection?: { reason: string; checks: Array<{ user_id: number; seat: number; eligible: boolean }> } | null;
  betting_deadline?: string | null;
  round_number?: number;
  banker_user_id?: number | null;
  my_bet?: string | null;
  my_lucky?: { type: string; label: string } | null;
  can_bet?: boolean;
  pot: string;
  players: SeatPlayer[];
  my_cards: string[] | null;
  /** Your saved, not yet submitted arrangement (restored when you come back; submitted for you at the timer's end). */
  my_draft?: { front: string[]; middle: string[]; back: string[] } | null;
  my_submission: { front: string[]; middle: string[]; back: string[]; lucky_type?: string | null } | null;
  arrangements: Arrangement[] | null;
  results: Result[] | null;
  cancel_reason: string | null;
}

export interface TableState {
  id: number;
  status: string;
  room: {
    id: number;
    name: string;
    currency: Currency;
    entry_amount: string;
    payout_mode: string;
    game_mode?: GameMode;
    min_bet?: string;
    max_bet?: string;
    lucky_hands_enabled?: boolean;
    bet_chips?: string[] | null;
    min_entry?: string | null;
    banker_reserve?: string | null;
    is_hosted?: boolean;
    invite_code?: string | null;
  };
  game_mode?: GameMode;
  rounds_total?: number;
  rounds_played?: number;
  banker_user_id?: number | null;
  creator_user_id?: number | null;
  next_round_at?: string | null;
  end_reason?: string | null;
  min_players?: number;
  standings?: Standing[] | null;
  my_banker_rounds_left?: number;
  players: SeatPlayer[];
  current_session_id: number | null;
  ready_timeout_seconds: number;
  session?: SessionState;
}

export interface Friend {
  id: number;
  user_id: number;
  username: string;
  name: string;
  /** Cartoon avatar id (lib/avatars). */
  avatar?: string | null;
  level: number;
  online: boolean;
  last_seen_at: string | null;
  in_game: boolean;
  room_name: string | null;
  status: 'pending' | 'accepted';
  direction: 'incoming' | 'outgoing';
}

export interface FriendsData {
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
  online_count: number;
}

export const LUCKY_LABELS: Record<string, string> = { three_flushes: 'Three Flushes', no_face_cards: 'No Face Cards', six_pairs: 'Six Pairs' };
