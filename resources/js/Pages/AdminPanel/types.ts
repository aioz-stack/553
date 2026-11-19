/** Shapes returned by /api/v1/admin/panel/* (App\Http\Controllers\Api\V1\Admin\PanelController). */

export interface Who {
  id: number;
  username: string;
  name: string;
  account_type: string;
  account_type_label: string;
}

export interface LoadLog {
  id: number;
  reference: string;
  direction: 'load' | 'withdraw' | 'request';
  transaction: string;
  sender: Who | null;
  account: Who | null;
  account_type: string;
  account_type_label: string;
  amount: string;
  signed_amount: string;
  status: 'completed' | 'pending' | 'rejected';
  processed_by: Who | null;
  note: string | null;
  ledger_reference: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface CommissionLog {
  id: number;
  reference: string;
  recipient: Who | null;
  account_type: string | null;
  account_type_label: string | null;
  source: { player: Who | null; game_session_id: number; kind: 'direct' | 'override' };
  fee_basis: string;
  rate: number;
  amount: string;
  status: string;
  created_at: string;
}

export interface Withdrawal {
  id: number;
  reference: string;
  agent: Who | null;
  account_type: string | null;
  account_type_label: string | null;
  amount: string;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  reviewed_by: Who | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface Account {
  id: number;
  account_id: string;
  username: string;
  name: string;
  account_type: string;
  account_type_label: string;
  requested_level: string | null;
  sponsor: Who | null;
  chips: string;
  commission: string | null;
  commission_rate: number | null;
  status: string;
  status_reason: string | null;
  status_changed_at: string | null;
  registered_at: string;
  approved_at: string | null;
  archived_at: string | null;
}

export interface PageMeta {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}
