import { query } from './db';

/**
 * Migration Script using mysql2
 * Creates:
 * 1. users: Telegram player profiles, token balances (coins, stars, free tickets), provably fair seed hashes & nonce
 * 2. lottery_draws: Scheduled jackpot lottery events with cryptographic server seeds, statuses, payout pools, and winning balls
 * 3. lottery_tickets: Player tickets with chosen numbers (1-35), purchase currency, matching count, and status
 * 4. spinner_sectors: Wheel slice definitions, prize types, rewards, and weights
 * 5. spinner_logs: Provably fair audit logs for instant spins (HMAC, seeds, outcome hash, winning index)
 */

export const MIGRATION_SQL = `
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  language_code VARCHAR(16) DEFAULT 'en',
  is_premium TINYINT(1) DEFAULT FALSE,
  coins_balance DECIMAL(20, 2) NOT NULL DEFAULT 200.00 CHECK (coins_balance >= 0),
  stars_balance DECIMAL(20, 2) NOT NULL DEFAULT 20.00 CHECK (stars_balance >= 0),
  free_tickets_balance INT NOT NULL DEFAULT 3 CHECK (free_tickets_balance >= 0),
  current_server_seed VARCHAR(64) NOT NULL,
  current_server_seed_hash VARCHAR(64) NOT NULL,
  nonce INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT NOW(),
  updated_at DATETIME NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);

-- 2. Lottery Draws Table
CREATE TABLE IF NOT EXISTS lottery_draws (
  draw_id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  ticket_price DECIMAL(20, 2) NOT NULL DEFAULT 10.00,
  currency VARCHAR(16) NOT NULL DEFAULT 'COINS' CHECK (currency IN ('COINS', 'STARS')),
  payout_pool DECIMAL(20, 2) NOT NULL DEFAULT 1000.00,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVING', 'RESOLVED', 'CANCELLED')),
  draw_time DATETIME NOT NULL,
  winning_numbers JSON DEFAULT NULL,
  server_seed VARCHAR(64) NOT NULL,
  server_seed_hash VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT NOW(),
  updated_at DATETIME NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lottery_draws_status ON lottery_draws(status);
CREATE INDEX idx_lottery_draws_draw_time ON lottery_draws(draw_time);

-- 3. Lottery Tickets Table
CREATE TABLE IF NOT EXISTS lottery_tickets (
  ticket_id VARCHAR(64) PRIMARY KEY,
  draw_id VARCHAR(64) NOT NULL REFERENCES lottery_draws(draw_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  numbers JSON NOT NULL,
  currency VARCHAR(16) NOT NULL,
  price_paid DECIMAL(20, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'WON', 'LOST')),
  matching_count INT DEFAULT 0,
  payout_amount DECIMAL(20, 2) DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lottery_tickets_draw ON lottery_tickets(draw_id);
CREATE INDEX idx_lottery_tickets_user ON lottery_tickets(user_id);

-- 4. Spinner Sectors Table
CREATE TABLE IF NOT EXISTS spinner_sectors (
  id INT PRIMARY KEY,
  label VARCHAR(64) NOT NULL,
  weight INT NOT NULL CHECK (weight > 0),
  prize_type VARCHAR(32) NOT NULL CHECK (prize_type IN ('COINS', 'STARS', 'FREE_TICKETS', 'JACKPOT_TICKET', 'NO_WIN')),
  prize_value DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  color VARCHAR(32) NOT NULL,
  icon VARCHAR(32) NOT NULL DEFAULT 'Sparkles',
  created_at DATETIME NOT NULL DEFAULT NOW()
);

-- 5. Spinner Provably Fair Audit Logs Table
CREATE TABLE IF NOT EXISTS spinner_logs (
  spin_id VARCHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  server_seed VARCHAR(64) NOT NULL,
  server_seed_hash VARCHAR(64) NOT NULL,
  client_seed VARCHAR(255) NOT NULL,
  nonce INT NOT NULL,
  outcome_hash VARCHAR(64) NOT NULL,
  winning_index INT NOT NULL,
  prize_type VARCHAR(32) NOT NULL,
  prize_value DECIMAL(20, 2) NOT NULL,
  cost_amount DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  cost_currency VARCHAR(16) NOT NULL DEFAULT 'FREE_TICKET',
  created_at DATETIME NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spinner_logs_user ON spinner_logs(user_id);
CREATE INDEX idx_spinner_logs_created_at ON spinner_logs(created_at DESC);

-- 6. User Account Controls (Ban Status)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned TINYINT(1) DEFAULT FALSE;

-- 7. Admin Users Table (RBAC & Multi-Factor Authentication)
CREATE TABLE IF NOT EXISTS admin_users (
  admin_id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) CHECK (role IN ('SUPER_ADMIN', 'LOTTERY_MANAGER', 'FINANCE_OFFICER', 'SUPPORT')) NOT NULL,
  mfa_secret VARCHAR(64),
  is_mfa_enabled TINYINT(1) DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Admin Audit Log Table (Immutable Ledger of Admin Actions)
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  log_id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  admin_id CHAR(36) REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  admin_username VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_resource VARCHAR(100) NOT NULL,
  payload JSON,
  ip_address VARCHAR(45),
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_audit_logs_timestamp ON admin_audit_logs(timestamp DESC);
CREATE INDEX idx_admin_audit_logs_action ON admin_audit_logs(action);

-- 9. Withdrawal Requests Table (Financial Approval Queue)
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  request_id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount DECIMAL(18, 4) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) CHECK (currency IN ('TON', 'STARS', 'COINS')) NOT NULL,
  destination_wallet VARCHAR(128) NOT NULL,
  status VARCHAR(20) CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED')) DEFAULT 'PENDING',
  processed_by CHAR(36) REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
);

CREATE INDEX idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX idx_withdrawal_requests_user ON withdrawal_requests(telegram_id);

-- 10. Referrals & Commission Ledger (Telegram Invites & 10% Lifetime RevShare)
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT REFERENCES users(telegram_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS referrals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  referrer_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  referee_id BIGINT NOT NULL UNIQUE REFERENCES users(telegram_id) ON DELETE CASCADE,
  signup_bonus_coins DECIMAL(20, 2) NOT NULL DEFAULT 50.00,
  total_commission_coins DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referee ON referrals(referee_id);

CREATE TABLE IF NOT EXISTS referral_rewards (
  reward_id VARCHAR(64) PRIMARY KEY,
  referrer_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  referee_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  reward_type VARCHAR(32) NOT NULL CHECK (reward_type IN ('SIGNUP_BONUS', 'DEPOSIT_COMMISSION', 'PRIZE_COMMISSION')),
  source_event VARCHAR(64) NOT NULL,
  original_amount DECIMAL(20, 2) NOT NULL,
  commission_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.1000,
  reward_coins DECIMAL(20, 2) NOT NULL,
  description TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referral_rewards_referrer ON referral_rewards(referrer_id);
CREATE INDEX idx_referral_rewards_created_at ON referral_rewards(created_at DESC);

-- Seed default Super Admin user (password: admin123)
INSERT IGNORE INTO admin_users (admin_id, username, email, password_hash, role, is_mfa_enabled)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'superadmin', 'admin@telegramlottery.io', 'pbkdf2_sha256_mock_hash_admin123', 'SUPER_ADMIN', TRUE),
  ('a0000000-0000-0000-0000-000000000002', 'manager', 'manager@telegramlottery.io', 'pbkdf2_sha256_mock_hash_manager123', 'LOTTERY_MANAGER', FALSE),
  ('a0000000-0000-0000-0000-000000000003', 'finance', 'finance@telegramlottery.io', 'pbkdf2_sha256_mock_hash_finance123', 'FINANCE_OFFICER', FALSE),
  ('a0000000-0000-0000-0000-000000000004', 'support', 'support@telegramlottery.io', 'pbkdf2_sha256_mock_hash_support123', 'SUPPORT', FALSE)
;
-- MySQL ignores duplicate seed rows through the unique username constraint.
`;

export async function runMigrations(): Promise<void> {
  console.log('[Database Migration] Running schema migration scripts...');
  try {
    await query(MIGRATION_SQL);
    console.log('[Database Migration] Tables (users, lottery_draws, lottery_tickets, spinner_sectors, spinner_logs) migrated successfully.');
  } catch (error) {
    console.error('[Database Migration] Error during migration:', error);
    throw error;
  }
}

// Auto-run when executed directly via CLI (e.g. tsx server/migrations.ts)
const isDirectRun = TINYINT(1)(
  process.argv[1] && (
    process.argv[1].endsWith('migrations.ts') ||
    process.argv[1].endsWith('migrations.js') ||
    process.argv[1].includes('migrations')
  )
);

if (isDirectRun) {
  runMigrations()
    .then(async () => {
      console.log('[Database Migration] Migration completed successfully.');
      const { closeDbPool } = await import('./db');
      await closeDbPool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Database Migration] Migration process exited with error:', err);
      const { closeDbPool } = await import('./db');
      await closeDbPool();
      process.exit(1);
    });
}
