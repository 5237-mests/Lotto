export interface UserBalances {
  coins: number;
  stars: number;
  free_tickets: number;
}

export interface UserProfile {
  telegram_id: number;
  username: string;
  first_name: string;
  balances: UserBalances;
  provably_fair: {
    current_server_seed_hash: string;
    nonce: number;
  };
}

export interface SpinnerSector {
  id: number;
  label: string;
  weight: number;
  prize_type: 'NO_WIN' | 'COINS' | 'FREE_TICKET' | 'STARS';
  prize_value: number;
  color: string;
}

export interface SpinnerConfig {
  sectors: SpinnerSector[];
  spin_cost_coins: number;
  user_nonce: number;
  server_seed_hash: string;
}

export interface SpinResult {
  winning_index: number;
  sector: SpinnerSector;
  animation: {
    duration_ms: number;
    total_rotations: number;
  };
  provably_fair: {
    revealed_server_seed: string;
    server_seed_hash: string;
    client_seed: string;
    nonce: number;
    outcome_hash: string;
    next_server_seed_hash: string;
  };
  balances: UserBalances;
}

export interface SpinAuditLog {
  spin_id: string;
  telegram_id: number;
  sector_id: number;
  sector_label: string;
  prize_type: string;
  prize_value: number;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  outcome_hash: string;
  spin_time: string;
}

export interface LotteryDraw {
  draw_id: string;
  title: string;
  ticket_price: number;
  currency: 'COINS' | 'STARS';
  payout_pool: number;
  status: 'OPEN' | 'LOCKED' | 'COMPLETED';
  draw_time: string;
  winning_numbers: number[] | null;
  server_seed_hash: string;
  ticket_count: number;
}

export interface LotteryTicket {
  ticket_id: string;
  draw_id: string;
  telegram_id: number;
  username: string;
  selected_numbers: number[];
  purchase_time: string;
  draw_title?: string;
  draw_status?: 'OPEN' | 'LOCKED' | 'COMPLETED' | 'UNKNOWN';
  draw_time?: string;
  currency?: 'COINS' | 'STARS';
  winning_numbers?: number[] | null;
  matches?: number;
  payout_won?: number;
}
