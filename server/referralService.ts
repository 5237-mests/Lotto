import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { query, getDbPool } from './db';

export const SIGNUP_BONUS_COINS = 50;
export const DEPOSIT_COMMISSION_RATE = 0.10; // 10%
export const PRIZE_COMMISSION_RATE = 0.10;   // 10%

export interface ReferralRecord {
  id: string;
  referrer_id: number;
  referee_id: number;
  referee_username: string;
  referee_first_name: string;
  signup_bonus_coins: number;
  total_commission_coins: number;
  created_at: string;
}

export interface ReferralReward {
  reward_id: string;
  referrer_id: number;
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

// In-Memory Fallback Stores
const inMemoryReferrals = new Map<number, ReferralRecord>(); // referee_id -> ReferralRecord
const inMemoryRewards: ReferralReward[] = [];

// Seed initial referral for testing
function seedInitialReferral() {
  const refereeId = 7770002; // Player 2 referred by Player 1 (7770001)
  const referrerId = 7770001;
  const now = new Date(Date.now() - 3600 * 1000 * 4).toISOString();

  inMemoryReferrals.set(refereeId, {
    id: 'ref-seed-001',
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_username: 'player_7770002',
    referee_first_name: 'Player #0002',
    signup_bonus_coins: SIGNUP_BONUS_COINS,
    total_commission_coins: 60,
    created_at: now,
  });

  inMemoryRewards.push(
    {
      reward_id: 'rw-seed-01',
      referrer_id: referrerId,
      referee_id: refereeId,
      referee_name: 'Player #0002',
      reward_type: 'SIGNUP_BONUS',
      source_event: 'FRIEND_SIGNUP',
      original_amount: SIGNUP_BONUS_COINS,
      commission_rate: 1.0,
      reward_coins: SIGNUP_BONUS_COINS,
      description: 'Friend joined via your Telegram invite link',
      created_at: now,
    },
    {
      reward_id: 'rw-seed-02',
      referrer_id: referrerId,
      referee_id: refereeId,
      referee_name: 'Player #0002',
      reward_type: 'DEPOSIT_COMMISSION',
      source_event: 'COIN_DEPOSIT',
      original_amount: 100,
      commission_rate: DEPOSIT_COMMISSION_RATE,
      reward_coins: 10,
      description: '10% Commission on friend deposit of 100 Coins',
      created_at: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    }
  );
}
seedInitialReferral();

/**
 * Register a new referral link between referrer and referee.
 */
export async function registerReferral(
  referrerId: number,
  refereeId: number,
  users: Map<number, any>
): Promise<{ success: boolean; bonus: number; error?: string }> {
  if (referrerId === refereeId) {
    return { success: false, bonus: 0, error: 'Cannot refer your own Telegram account.' };
  }

  const referee = users.get(refereeId);
  if (!referee) {
    return { success: false, bonus: 0, error: 'Referee account not found.' };
  }

  if (referee.referred_by) {
    return { success: false, bonus: 0, error: 'User is already linked to a referrer.' };
  }

  const referrer = users.get(referrerId);
  if (!referrer) {
    return { success: false, bonus: 0, error: 'Referrer does not exist.' };
  }

  // Set referral link
  referee.referred_by = referrerId;

  // Credit bonuses
  referrer.balance_coins = (referrer.balance_coins || 0) + SIGNUP_BONUS_COINS;
  referee.balance_coins = (referee.balance_coins || 0) + SIGNUP_BONUS_COINS;
  referee.free_tickets = (referee.free_tickets || 0) + 1;

  const referralRecord: ReferralRecord = {
    id: crypto.randomUUID(),
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_username: referee.username || `player_${refereeId}`,
    referee_first_name: referee.first_name || `Player #${refereeId.toString().slice(-4)}`,
    signup_bonus_coins: SIGNUP_BONUS_COINS,
    total_commission_coins: 0,
    created_at: new Date().toISOString(),
  };
  inMemoryReferrals.set(refereeId, referralRecord);

  const reward: ReferralReward = {
    reward_id: crypto.randomUUID(),
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_name: referee.first_name || referee.username || `Player #${refereeId}`,
    reward_type: 'SIGNUP_BONUS',
    source_event: 'FRIEND_SIGNUP',
    original_amount: SIGNUP_BONUS_COINS,
    commission_rate: 1.0,
    reward_coins: SIGNUP_BONUS_COINS,
    description: `Invite bonus: ${referee.first_name || referee.username} joined via your link!`,
    created_at: new Date().toISOString(),
  };
  inMemoryRewards.unshift(reward);

  // Sync to MySQL database if reachable
  try {
    await query(
      `UPDATE users SET referred_by = ?, coins_balance = coins_balance + ?, free_tickets_balance = free_tickets_balance + 1 WHERE telegram_id = ?`,
      [referrerId, SIGNUP_BONUS_COINS, refereeId]
    );
    await query(
      `UPDATE users SET coins_balance = coins_balance + ? WHERE telegram_id = ?`,
      [SIGNUP_BONUS_COINS, referrerId]
    );
    await query(
      `INSERT INTO referrals (referrer_id, referee_id, signup_bonus_coins, total_commission_coins, created_at)
       VALUES (?, ?, ?, 0, NOW())
       ON DUPLICATE KEY UPDATE referee_id = referee_id`,
      [referrerId, refereeId, SIGNUP_BONUS_COINS]
    );
    await query(
      `INSERT INTO referral_rewards (reward_id, referrer_id, referee_id, reward_type, source_event, original_amount, commission_rate, reward_coins, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        reward.reward_id,
        reward.referrer_id,
        reward.referee_id,
        reward.reward_type,
        reward.source_event,
        reward.original_amount,
        reward.commission_rate,
        reward.reward_coins,
        reward.description,
      ]
    );
  } catch (dbErr) {
    // Non-blocking in-memory fallback
  }

  return { success: true, bonus: SIGNUP_BONUS_COINS };
}

/**
 * Process a 10% commission on friend deposits.
 */
export async function processDepositCommission(
  refereeId: number,
  depositCoins: number,
  users: Map<number, any>
): Promise<ReferralReward | null> {
  if (depositCoins <= 0) return null;

  const referee = users.get(refereeId);
  const referrerId = referee?.referred_by || inMemoryReferrals.get(refereeId)?.referrer_id;
  if (!referrerId) return null;

  const referrer = users.get(referrerId);
  if (!referrer) return null;

  const commission = Math.round(depositCoins * DEPOSIT_COMMISSION_RATE * 100) / 100;
  if (commission <= 0) return null;

  // Credit commission to referrer
  referrer.balance_coins = (referrer.balance_coins || 0) + commission;

  // Update total in referral record
  const record = inMemoryReferrals.get(refereeId);
  if (record) {
    record.total_commission_coins = (record.total_commission_coins || 0) + commission;
  }

  const refereeName = referee?.first_name || referee?.username || `Player #${refereeId.toString().slice(-4)}`;

  const reward: ReferralReward = {
    reward_id: crypto.randomUUID(),
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_name: refereeName,
    reward_type: 'DEPOSIT_COMMISSION',
    source_event: 'COIN_DEPOSIT',
    original_amount: depositCoins,
    commission_rate: DEPOSIT_COMMISSION_RATE,
    reward_coins: commission,
    description: `10% Deposit Commission (+${commission} Coins) from ${refereeName}'s deposit of ${depositCoins} Coins`,
    created_at: new Date().toISOString(),
  };
  inMemoryRewards.unshift(reward);

  // MySQL sync
  try {
    await query(
      `UPDATE users SET coins_balance = coins_balance + ? WHERE telegram_id = ?`,
      [commission, referrerId]
    );
    await query(
      `UPDATE referrals SET total_commission_coins = total_commission_coins + ? WHERE referee_id = ?`,
      [commission, refereeId]
    );
    await query(
      `INSERT INTO referral_rewards (reward_id, referrer_id, referee_id, reward_type, source_event, original_amount, commission_rate, reward_coins, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        reward.reward_id,
        reward.referrer_id,
        reward.referee_id,
        reward.reward_type,
        reward.source_event,
        reward.original_amount,
        reward.commission_rate,
        reward.reward_coins,
        reward.description,
      ]
    );
  } catch (dbErr) {
    // Non-blocking
  }

  return reward;
}

/**
 * Process a 10% commission on friend prize winnings (Spinner wheel or Lottery jackpot).
 */
export async function processPrizeCommission(
  refereeId: number,
  prizeCoins: number,
  sourceEvent: string,
  users: Map<number, any>
): Promise<ReferralReward | null> {
  if (prizeCoins <= 0) return null;

  const referee = users.get(refereeId);
  const referrerId = referee?.referred_by || inMemoryReferrals.get(refereeId)?.referrer_id;
  if (!referrerId) return null;

  const referrer = users.get(referrerId);
  if (!referrer) return null;

  const commission = Math.round(prizeCoins * PRIZE_COMMISSION_RATE * 100) / 100;
  if (commission <= 0) return null;

  // Credit commission to referrer
  referrer.balance_coins = (referrer.balance_coins || 0) + commission;

  // Update total in referral record
  const record = inMemoryReferrals.get(refereeId);
  if (record) {
    record.total_commission_coins = (record.total_commission_coins || 0) + commission;
  }

  const refereeName = referee?.first_name || referee?.username || `Player #${refereeId.toString().slice(-4)}`;

  const reward: ReferralReward = {
    reward_id: crypto.randomUUID(),
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_name: refereeName,
    reward_type: 'PRIZE_COMMISSION',
    source_event: sourceEvent,
    original_amount: prizeCoins,
    commission_rate: PRIZE_COMMISSION_RATE,
    reward_coins: commission,
    description: `10% Win Commission (+${commission} Coins) from ${refereeName}'s prize win of ${prizeCoins} Coins in ${sourceEvent}`,
    created_at: new Date().toISOString(),
  };
  inMemoryRewards.unshift(reward);

  // MySQL sync
  try {
    await query(
      `UPDATE users SET coins_balance = coins_balance + ? WHERE telegram_id = ?`,
      [commission, referrerId]
    );
    await query(
      `UPDATE referrals SET total_commission_coins = total_commission_coins + ? WHERE referee_id = ?`,
      [commission, refereeId]
    );
    await query(
      `INSERT INTO referral_rewards (reward_id, referrer_id, referee_id, reward_type, source_event, original_amount, commission_rate, reward_coins, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        reward.reward_id,
        reward.referrer_id,
        reward.referee_id,
        reward.reward_type,
        reward.source_event,
        reward.original_amount,
        reward.commission_rate,
        reward.reward_coins,
        reward.description,
      ]
    );
  } catch (dbErr) {
    // Non-blocking
  }

  return reward;
}

/**
 * Get comprehensive referral statistics for a user.
 */
export function getReferralStats(telegramId: number, users: Map<number, any>, req: Request) {
  const user = users.get(telegramId);
  const botUsername = process.env.BOT_USERNAME || 'LuckyFortuneLottoBot';

  // Format link for Telegram Mini App startapp deep linking:
  // t.me/botusername/app?startapp=ref_12345 or t.me/botusername?startapp=ref_12345
  const inviteLink = `https://t.me/${botUsername}?startapp=ref_${telegramId}`;
  const shareText = `ðŸŽ° Spin the Fortune Wheel & Win Real Crypto with me! Get 50 Free Bonus Coins & 1 Free Lottery Ticket when you sign up with my invite link! ðŸŽ`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

  // Find all friends referred by this user
  const friendsList: any[] = [];
  inMemoryReferrals.forEach((record) => {
    if (record.referrer_id === telegramId) {
      friendsList.push({
        telegram_id: record.referee_id,
        username: record.referee_username,
        first_name: record.referee_first_name,
        joined_at: record.created_at,
        total_commission_generated: record.total_commission_coins + record.signup_bonus_coins,
        status: 'ACTIVE',
      });
    }
  });

  // Find all rewards for this user
  const userRewards = inMemoryRewards.filter((r) => r.referrer_id === telegramId);

  let signupTotal = 0;
  let depositTotal = 0;
  let prizeTotal = 0;

  userRewards.forEach((r) => {
    if (r.reward_type === 'SIGNUP_BONUS') signupTotal += r.reward_coins;
    else if (r.reward_type === 'DEPOSIT_COMMISSION') depositTotal += r.reward_coins;
    else if (r.reward_type === 'PRIZE_COMMISSION') prizeTotal += r.reward_coins;
  });

  // Check who referred this user
  let referrerInfo: any = null;
  if (user?.referred_by) {
    const parent = users.get(user.referred_by);
    referrerInfo = {
      telegram_id: user.referred_by,
      username: parent?.username || `player_${user.referred_by}`,
      first_name: parent?.first_name || 'Your Referrer',
    };
  }

  return {
    referral_code: `ref_${telegramId}`,
    invite_link: inviteLink,
    telegram_share_url: telegramShareUrl,
    signup_bonus_coins: SIGNUP_BONUS_COINS,
    deposit_commission_rate: DEPOSIT_COMMISSION_RATE,
    prize_commission_rate: PRIZE_COMMISSION_RATE,
    total_friends_referred: friendsList.length,
    total_commission_earned: Math.round((signupTotal + depositTotal + prizeTotal) * 100) / 100,
    breakdown: {
      signup_bonuses: Math.round(signupTotal * 100) / 100,
      deposit_commissions: Math.round(depositTotal * 100) / 100,
      prize_commissions: Math.round(prizeTotal * 100) / 100,
    },
    referred_by: referrerInfo,
    friends: friendsList,
    recent_rewards: userRewards.slice(0, 20),
  };
}

/**
 * Express router for Referral API endpoints
 */
export function createReferralRouter(users: Map<number, any>): express.Router {
  const router = express.Router();

  // Helper to extract user
  const getUser = (req: Request) => {
    const customId = req.headers['x-telegram-user-id'];
    let id = 7770001;
    if (customId && !isNaN(Number(customId))) {
      id = Number(customId);
    }
    let user = users.get(id);
    if (!user) {
      user = {
        telegram_id: id,
        username: `player_${id}`,
        first_name: `Player #${id.toString().slice(-4)}`,
        balance_coins: 200.0,
        balance_stars: 20,
        free_tickets: 3,
        nonce: 0,
        current_server_seed: crypto.randomBytes(32).toString('hex'),
        created_at: new Date().toISOString(),
        referred_by: null,
      };
      users.set(id, user);
    }
    return user;
  };

  // 1. Get referral stats & link
  router.get('/stats', (req: Request, res: Response) => {
    const user = getUser(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }
    const stats = getReferralStats(user.telegram_id, users, req);
    res.json({ success: true, data: stats });
  });

  // 2. Apply a referral code manually (if not joined via deep link)
  router.post('/apply', async (req: Request, res: Response) => {
    const user = getUser(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { referral_code } = req.body;
    if (!referral_code || typeof referral_code !== 'string') {
      return res.status(400).json({ success: false, error: 'Please enter a valid referral code or link.' });
    }

    // Extract telegram ID from "ref_123456" or "123456"
    const cleaned = referral_code.trim().replace(/^ref_/, '');
    const referrerId = Number(cleaned);

    if (isNaN(referrerId) || referrerId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid referral code format.' });
    }

    // Ensure referrer exists in user store
    if (!users.has(referrerId)) {
      // Auto-create referrer in demo memory if missing
      users.set(referrerId, {
        telegram_id: referrerId,
        username: `player_${referrerId}`,
        first_name: `Player #${referrerId.toString().slice(-4)}`,
        balance_coins: 200,
        balance_stars: 20,
        free_tickets: 3,
        nonce: 0,
        current_server_seed: crypto.randomBytes(32).toString('hex'),
        created_at: new Date().toISOString(),
      });
    }

    const result = await registerReferral(referrerId, user.telegram_id, users);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      message: `Referral applied! You and your referrer both received +${SIGNUP_BONUS_COINS} Bonus Coins and 1 Free Ticket!`,
      bonus_received: SIGNUP_BONUS_COINS,
      balances: {
        coins: user.balance_coins,
        stars: user.balance_stars,
        free_tickets: user.free_tickets,
      },
    });
  });

  // 3. Simulate a friend action (JOIN, DEPOSIT, WIN) for interactive demo/verification
  router.post('/simulate', async (req: Request, res: Response) => {
    const user = getUser(req);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { action } = req.body; // 'JOIN' | 'DEPOSIT' | 'WIN'
    const referrerId = user.telegram_id;

    if (action === 'JOIN') {
      const mockFriendId = Math.floor(1000000 + Math.random() * 9000000);
      const mockUsername = `friend_${Math.floor(100 + Math.random() * 900)}`;
      const mockFirstName = `Alex ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`;

      users.set(mockFriendId, {
        telegram_id: mockFriendId,
        username: mockUsername,
        first_name: mockFirstName,
        balance_coins: 250,
        balance_stars: 20,
        free_tickets: 4,
        nonce: 0,
        current_server_seed: crypto.randomBytes(32).toString('hex'),
        created_at: new Date().toISOString(),
        referred_by: referrerId,
      });

      const reg = await registerReferral(referrerId, mockFriendId, users);
      const stats = getReferralStats(referrerId, users, req);

      return res.json({
        success: true,
        message: `ðŸŽ‰ Simulated Friend "${mockFirstName}" joined using your Telegram invite link! You earned +${SIGNUP_BONUS_COINS} Coins!`,
        action_type: 'JOIN',
        earned_coins: SIGNUP_BONUS_COINS,
        balances: {
          coins: user.balance_coins,
          stars: user.balance_stars,
          free_tickets: user.free_tickets,
        },
        stats,
      });
    }

    // For DEPOSIT and WIN, find an existing referred friend or create one first
    let friendId: number | null = null;
    let friendName = 'Referred Friend';

    inMemoryReferrals.forEach((rec) => {
      if (rec.referrer_id === referrerId && !friendId) {
        friendId = rec.referee_id;
        friendName = rec.referee_first_name;
      }
    });

    if (!friendId) {
      // Create a friend first
      friendId = Math.floor(1000000 + Math.random() * 9000000);
      friendName = `Jordan T.`;
      users.set(friendId, {
        telegram_id: friendId,
        username: `friend_${friendId.toString().slice(-4)}`,
        first_name: friendName,
        balance_coins: 500,
        balance_stars: 50,
        free_tickets: 5,
        nonce: 0,
        current_server_seed: crypto.randomBytes(32).toString('hex'),
        created_at: new Date().toISOString(),
        referred_by: referrerId,
      });
      await registerReferral(referrerId, friendId, users);
    }

    if (action === 'DEPOSIT') {
      const depositAmount = 100; // 100 Coins
      const reward = await processDepositCommission(friendId, depositAmount, users);
      const stats = getReferralStats(referrerId, users, req);

      return res.json({
        success: true,
        message: `ðŸ’³ Simulated Friend "${friendName}" deposited ${depositAmount} Coins! You earned a 10% commission (+${reward?.reward_coins} Coins)!`,
        action_type: 'DEPOSIT',
        earned_coins: reward?.reward_coins || 10,
        balances: {
          coins: user.balance_coins,
          stars: user.balance_stars,
          free_tickets: user.free_tickets,
        },
        stats,
      });
    }

    if (action === 'WIN') {
      const prizeAmount = 500; // 500 Coins Jackpot
      const reward = await processPrizeCommission(friendId, prizeAmount, 'WHEEL_JACKPOT_SPIN', users);
      const stats = getReferralStats(referrerId, users, req);

      return res.json({
        success: true,
        message: `ðŸ† Simulated Friend "${friendName}" hit a 500 Coin Jackpot win! You earned a 10% prize commission (+${reward?.reward_coins} Coins)!`,
        action_type: 'WIN',
        earned_coins: reward?.reward_coins || 50,
        balances: {
          coins: user.balance_coins,
          stars: user.balance_stars,
          free_tickets: user.free_tickets,
        },
        stats,
      });
    }

    return res.status(400).json({ success: false, error: 'Unknown simulation action.' });
  });

  return router;
}
