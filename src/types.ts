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

export type AdminRole = 'SUPER_ADMIN' | 'LOTTERY_MANAGER' | 'FINANCE_OFFICER' | 'SUPPORT';

export interface AdminUser {
  admin_id: string;
  username: string;
  email: string;
  role: AdminRole;
  is_mfa_enabled: boolean;
}

export interface AdminAuditLog {
  log_id: string;
  admin_id: string;
  admin_username: string;
  action: string;
  target_resource: string;
  payload: any;
  ip_address: string;
  timestamp: string;
}

export interface WithdrawalRequest {
  request_id: string;
  telegram_id: number;
  username: string;
  amount: number;
  currency: 'TON' | 'STARS' | 'COINS';
  destination_wallet: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
  processed_by?: string;
  created_at: string;
  processed_at?: string;
  notes?: string;
}

export interface AdminDashboardMetrics {
  financials: {
    ggr: number;
    total_turnover: number;
    total_payouts_paid: number;
    profit_margin_pct: number;
  };
  users: {
    total_registered: number;
    dau_estimate: number;
    mau_estimate: number;
    banned_users: number;
  };
  spinner_analytics: {
    total_spins: number;
    theoretical_rtp: string;
    actual_rtp: string;
    house_margin: string;
  };
  lottery_analytics: {
    open_draws: number;
    active_draw_pool: number;
    total_tickets_sold: number;
  };
  financial_queue: {
    pending_withdrawals: number;
  };
}

export interface AdminUserRecord {
  telegram_id: number;
  username: string;
  first_name: string;
  balance_coins: number;
  balance_stars: number;
  free_tickets: number;
  nonce: number;
  is_banned: boolean;
  total_spent: number;
  total_won: number;
  net_profit: number;
  tickets_count: number;
  spins_count: number;
  created_at: string;
}

export interface RtpSimulationResult {
  iterations: number;
  cost_per_spin: number;
  total_wagered: number;
  total_payout_distributed: number;
  theoretical_rtp: string;
  theoretical_rtp_numeric: number;
  simulated_rtp: string;
  simulated_rtp_numeric: number;
  house_edge: string;
  house_edge_numeric: number;
  is_house_profitable: boolean;
  sector_breakdown: Array<{
    sector_id: number;
    label: string;
    weight: number;
    prize_type: string;
    prize_value: number;
    theoretical_win_rate: number;
    empirical_win_rate: number;
    total_hits: number;
  }>;
}

export interface ReferralFriend {
  telegram_id: number;
  username: string;
  first_name: string;
  joined_at: string;
  total_commission_generated: number;
  status: 'ACTIVE' | 'PENDING';
}

export interface ReferralRewardLog {
  reward_id: string;
  referee_id: number;
  referee_name: string;
  reward_type: 'SIGNUP_BONUS' | 'DEPOSIT_COMMISSION' | 'PRIZE_COMMISSION';
  source_event: string;
  original_amount: number;
  commission_rate: number;
  reward_coins: number;
  description: string;
  created_at: string;
}

export interface ReferralStats {
  referral_code: string;
  invite_link: string;
  telegram_share_url: string;
  signup_bonus_coins: number;
  deposit_commission_rate: number;
  prize_commission_rate: number;
  total_friends_referred: number;
  total_commission_earned: number;
  breakdown: {
    signup_bonuses: number;
    deposit_commissions: number;
    prize_commissions: number;
  };
  referred_by: {
    telegram_id: number;
    username: string;
    first_name: string;
  } | null;
  friends: ReferralFriend[];
  recent_rewards: ReferralRewardLog[];
}
