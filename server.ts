import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { verifyTelegramWebAppData, validateTelegramInitData } from './server/auth';
import { runMigrations } from './server/migrations';
import { calculateSpinResult, hashServerSeed, DEFAULT_SECTORS } from './ProvablyFairEngine.js';
import { executeSpinnerTransaction } from './server/spinnerService';
import { createAdminRouter } from './server/adminService';
import {
  createReferralRouter,
  processDepositCommission,
  processPrizeCommission,
  registerReferral,
  SIGNUP_BONUS_COINS
} from './server/referralService';

const app = express();
const PORT = 3000;

app.use(express.json());

// CORS & Preflight handling
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-telegram-user-id, x-admin-role, x-referral-code');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// In-Memory Database Store
interface User {
  telegram_id: number;
  username: string;
  first_name: string;
  balance_coins: number;
  balance_stars: number;
  free_tickets: number;
  nonce: number;
  current_server_seed: string;
  created_at: string;
  referred_by?: number | null;
  is_banned?: boolean;
}

interface SpinnerSector {
  id: number;
  label: string;
  weight: number;
  prize_type: 'NO_WIN' | 'COINS' | 'FREE_TICKET' | 'STARS';
  prize_value: number;
  color: string;
}

interface SpinLog {
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

interface LotteryDraw {
  draw_id: string;
  title: string;
  ticket_price: number;
  currency: 'COINS' | 'STARS';
  payout_pool: number;
  status: 'OPEN' | 'LOCKED' | 'COMPLETED';
  draw_time: string; // ISO
  winning_numbers: number[] | null;
  server_seed: string;
  server_seed_hash: string;
  created_at: string;
  ticket_count: number;
}

interface LotteryTicket {
  ticket_id: string;
  draw_id: string;
  telegram_id: number;
  username: string;
  selected_numbers: number[];
  purchase_time: string;
  matches?: number;
  payout_won?: number;
}

const users = new Map<number, User>();
const spinLogs: SpinLog[] = [];
const lotteryDraws = new Map<string, LotteryDraw>();
const lotteryTickets: LotteryTicket[] = [];

// Base Spinner Sectors as per Specification Blueprint
const SPINNER_SECTORS: SpinnerSector[] = [
  { id: 0, label: 'Try Again', weight: 400, prize_type: 'NO_WIN', prize_value: 0, color: '#1E293B' },
  { id: 1, label: '10 Coins', weight: 300, prize_type: 'COINS', prize_value: 10, color: '#0EA5E9' },
  { id: 2, label: '1 Free Ticket', weight: 200, prize_type: 'FREE_TICKET', prize_value: 1, color: '#10B981' },
  { id: 3, label: '50 Coins', weight: 90, prize_type: 'COINS', prize_value: 50, color: '#F59E0B' },
  { id: 4, label: 'JACKPOT (500)', weight: 10, prize_type: 'COINS', prize_value: 500, color: '#EF4444' }
];

// Seed initial lottery draws
function initializeLotteryDraws() {
  const now = Date.now();
  const initialDraws = [
    {
      id: 'draw-hourly-1',
      title: '⚡ Lightning Hourly Jackpot',
      ticket_price: 15,
      currency: 'COINS' as const,
      payout_pool: 1250,
      draw_time: new Date(now + 15 * 60 * 1000).toISOString(), // 15 mins from now
    },
    {
      id: 'draw-daily-1',
      title: '🌟 Daily Grand Super-Lotto',
      ticket_price: 50,
      currency: 'COINS' as const,
      payout_pool: 8500,
      draw_time: new Date(now + 6 * 3600 * 1000).toISOString(), // 6 hrs from now
    },
    {
      id: 'draw-stars-1',
      title: '⭐ Telegram Stars Mega Bonanza',
      ticket_price: 5,
      currency: 'STARS' as const,
      payout_pool: 350,
      draw_time: new Date(now + 24 * 3600 * 1000).toISOString(), // 24 hrs from now
    }
  ];

  for (const d of initialDraws) {
    const seed = crypto.randomBytes(32).toString('hex');
    lotteryDraws.set(d.id, {
      draw_id: d.id,
      title: d.title,
      ticket_price: d.ticket_price,
      currency: d.currency,
      payout_pool: d.payout_pool,
      status: 'OPEN',
      draw_time: d.draw_time,
      winning_numbers: null,
      server_seed: seed,
      server_seed_hash: crypto.createHash('sha256').update(seed).digest('hex'),
      created_at: new Date().toISOString(),
      ticket_count: 0,
    });
  }
}
initializeLotteryDraws();

// Parse Telegram InitData or generate demo user
function resolveTelegramUser(req: Request): User {
  const authHeader = req.headers['authorization']?.replace('Bearer ', '').replace('tma ', '') || '';
  const customId = req.headers['x-telegram-user-id'];

  let telegramId = 7770001;
  let username = 'lotto_player';
  let firstName = 'Player One';

  if (req.telegramUser) {
    telegramId = req.telegramUser.id;
    if (req.telegramUser.username) username = req.telegramUser.username;
    if (req.telegramUser.first_name) firstName = req.telegramUser.first_name;
  } else if (customId && !isNaN(Number(customId))) {
    telegramId = Number(customId);
    username = `player_${telegramId}`;
    firstName = `Player #${telegramId.toString().slice(-4)}`;
  } else if (authHeader && authHeader.includes('user=')) {
    try {
      const params = new URLSearchParams(authHeader);
      const userRaw = params.get('user');
      if (userRaw) {
        const parsed = JSON.parse(decodeURIComponent(userRaw));
        if (parsed.id) telegramId = parsed.id;
        if (parsed.username) username = parsed.username;
        if (parsed.first_name) firstName = parsed.first_name;
      }
    } catch {
      // ignore
    }
  }

  let user = users.get(telegramId);

  // Check for referral code in query, headers, body, or start_param
  let refParam = (req.query?.ref as string) || (req.headers['x-referral-code'] as string) || (req.body?.referrer_id as string) || (req.body?.start_param as string) || '';
  if (!refParam && authHeader && authHeader.includes('start_param=')) {
    try {
      const params = new URLSearchParams(authHeader);
      refParam = params.get('start_param') || '';
    } catch {
      // ignore
    }
  }
  let potentialReferrerId: number | null = null;
  if (refParam) {
    const cleaned = refParam.toString().replace(/^ref_/, '');
    const num = Number(cleaned);
    if (!isNaN(num) && num > 0 && num !== telegramId) {
      potentialReferrerId = num;
    }
  }

  if (!user) {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    user = {
      telegram_id: telegramId,
      username,
      first_name: firstName,
      balance_coins: 200.0,
      balance_stars: 20,
      free_tickets: 3,
      nonce: 0,
      current_server_seed: serverSeed,
      created_at: new Date().toISOString(),
      referred_by: potentialReferrerId || null
    };
    users.set(telegramId, user);

    if (potentialReferrerId) {
      registerReferral(potentialReferrerId, telegramId, users).catch(() => {});
    }
  } else if (!user.referred_by && potentialReferrerId) {
    registerReferral(potentialReferrerId, telegramId, users).catch(() => {});
  }

  return user;
}

// Provably Fair Calculation Helper
function selectWeightedSector(sectors: SpinnerSector[], hashHex: string): SpinnerSector {
  const totalWeight = sectors.reduce((acc, s) => acc + s.weight, 0);
  const numericValue = parseInt(hashHex.substring(0, 8), 16);
  let randomWeight = numericValue % totalWeight;

  for (const sector of sectors) {
    if (randomWeight < sector.weight) {
      return sector;
    }
    randomWeight -= sector.weight;
  }
  return sectors[0];
}

// --- API ROUTES ---

// 0. Admin API Gateway (/api/v1/admin/*)
app.use('/api/v1/admin', createAdminRouter({
  users,
  lotteryDraws,
  lotteryTickets,
  SPINNER_SECTORS,
  spinLogs
}));

// 0b. Referral & Affiliate API Gateway (/api/v1/referral/*)
app.use('/api/v1/referral', createReferralRouter(users));

// 1. Telegram Auth / Profile
app.post('/api/v1/auth/telegram', (req: Request, res: Response) => {
  const initData = req.headers['authorization']?.replace('Bearer ', '').replace('tma ', '') || (req.body?.initData as string) || '';
  const botToken = process.env.BOT_TOKEN;

  if (botToken && initData) {
    const result = validateTelegramInitData(initData, botToken);
    if (!result.valid) {
      return res.status(401).json({ success: false, error: `Unauthorized: ${result.error || 'Invalid signature'}` });
    }
    if (result.data?.user) {
      req.telegramUser = result.data.user;
    }
  }

  const user = resolveTelegramUser(req);
  const nextSeedHash = crypto.createHash('sha256').update(user.current_server_seed).digest('hex');

  res.json({
    success: true,
    data: {
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name,
      balances: {
        coins: user.balance_coins,
        stars: user.balance_stars,
        free_tickets: user.free_tickets
      },
      provably_fair: {
        current_server_seed_hash: nextSeedHash,
        nonce: user.nonce
      },
      referred_by: user.referred_by || null
    }
  });
});

// 2. Faucet (Demo Coins / Stars Top Up)
app.post('/api/v1/faucet', async (req: Request, res: Response) => {
  const user = resolveTelegramUser(req);
  user.balance_coins += 100;
  user.balance_stars += 10;
  user.free_tickets += 2;

  // 10% deposit commission on faucet top-ups for referrer
  await processDepositCommission(user.telegram_id, 100, users);

  res.json({
    success: true,
    message: 'Added 100 Coins, 10 Stars, and 2 Free Tickets!',
    balances: {
      coins: user.balance_coins,
      stars: user.balance_stars,
      free_tickets: user.free_tickets
    }
  });
});

// 2b. Deposit Coins (with 10% Referral Commission)
app.post('/api/v1/deposit', async (req: Request, res: Response) => {
  const user = resolveTelegramUser(req);
  if ((user as any).is_banned) {
    return res.status(403).json({ success: false, error: 'Account suspended.' });
  }

  const amount = Number(req.body.amount) || 100;
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid deposit amount' });
  }

  user.balance_coins += amount;

  // Process 10% commission to referrer
  const commissionReward = await processDepositCommission(user.telegram_id, amount, users);

  res.json({
    success: true,
    message: `Successfully deposited ${amount} Coins!`,
    deposit_amount: amount,
    balances: {
      coins: user.balance_coins,
      stars: user.balance_stars,
      free_tickets: user.free_tickets
    },
    referral_commission: commissionReward ? {
      referrer_id: commissionReward.referrer_id,
      commission_coins: commissionReward.reward_coins
    } : null
  });
});

// 3. Spinner Configuration
app.get('/api/v1/spinner/config', (req: Request, res: Response) => {
  const user = resolveTelegramUser(req);
  const serverSeedHash = crypto.createHash('sha256').update(user.current_server_seed).digest('hex');

  res.json({
    success: true,
    data: {
      sectors: SPINNER_SECTORS,
      spin_cost_coins: 10,
      user_nonce: user.nonce,
      server_seed_hash: serverSeedHash
    }
  });
});

// 4. Provably Fair Spin (HMAC-SHA256 RNG Engine)
app.post('/api/v1/spinner/spin', async (req: Request, res: Response) => {
  try {
    const user = resolveTelegramUser(req);
    if ((user as any).is_banned) {
      return res.status(403).json({ success: false, error: 'Account suspended by administrator. Please contact support.' });
    }
    const { client_seed, use_free_ticket } = req.body;

    const result = await executeSpinnerTransaction(
      {
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        clientSeed: client_seed,
        useFreeTicket: Boolean(use_free_ticket),
        sectors: SPINNER_SECTORS
      },
      user,
      spinLogs
    );

    // Process 10% prize commission for referrer on coin wins
    if (result.sector.prize_type === 'COINS' && result.sector.prize_value > 0) {
      await processPrizeCommission(user.telegram_id, result.sector.prize_value, `SPINNER_${result.sector.label}`, users);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Internal error during spin processing'
    });
  }
});

// 5. Provably Fair Verification Endpoint
app.post('/api/v1/spinner/verify', (req: Request, res: Response) => {
  const { server_seed, client_seed, nonce } = req.body;

  if (!server_seed || !client_seed || nonce === undefined) {
    return res.status(400).json({ success: false, error: 'Missing verification parameters' });
  }

  try {
    const result = calculateSpinResult(server_seed, client_seed, nonce, SPINNER_SECTORS);

    res.json({
      success: true,
      data: {
        server_seed_hash: result.serverSeedHash,
        outcome_hash: result.outcomeHash,
        winning_index: result.winningIndex,
        winningIndex: result.winningIndex,
        sector: result.sector
      }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || 'Invalid verification payload'
    });
  }
});

// 6. Spinner History
app.get('/api/v1/spinner/history', (req: Request, res: Response) => {
  const user = resolveTelegramUser(req);
  const userLogs = spinLogs
    .filter(l => l.telegram_id === user.telegram_id)
    .slice(0, 30);

  res.json({
    success: true,
    data: userLogs
  });
});

// 7. Scheduled Lottery Draws List
app.get('/api/v1/lottery/draws', (req: Request, res: Response) => {
  const draws = Array.from(lotteryDraws.values());
  res.json({
    success: true,
    data: draws
  });
});

// 8. Buy Lottery Ticket
app.post('/api/v1/lottery/buy-ticket', (req: Request, res: Response) => {
  const user = resolveTelegramUser(req);
  if ((user as any).is_banned) {
    return res.status(403).json({ success: false, error: 'Account suspended by administrator. Please contact support.' });
  }
  const { draw_id, selected_numbers, use_free_ticket } = req.body;

  const draw = lotteryDraws.get(draw_id);
  if (!draw) {
    return res.status(404).json({ success: false, error: 'Draw not found' });
  }

  if (draw.status !== 'OPEN') {
    return res.status(400).json({ success: false, error: 'Draw is locked or already completed' });
  }

  if (!Array.isArray(selected_numbers) || selected_numbers.length !== 5) {
    return res.status(400).json({ success: false, error: 'Please choose exactly 5 numbers (1-35)' });
  }

  // Validate number range and uniqueness
  const numSet = new Set(selected_numbers.map(n => Number(n)));
  if (numSet.size !== 5) {
    return res.status(400).json({ success: false, error: 'Numbers must be unique' });
  }
  for (const n of numSet) {
    if (n < 1 || n > 35 || !Number.isInteger(n)) {
      return res.status(400).json({ success: false, error: 'Numbers must be between 1 and 35' });
    }
  }

  const sortedNumbers = Array.from(numSet).sort((a, b) => a - b);

  if (use_free_ticket && user.free_tickets > 0 && draw.currency === 'COINS') {
    user.free_tickets -= 1;
    draw.payout_pool += draw.ticket_price * 0.7; // 70% goes to pool
  } else {
    if (draw.currency === 'COINS') {
      if (user.balance_coins < draw.ticket_price) {
        return res.status(400).json({ success: false, error: 'Insufficient coins for ticket' });
      }
      user.balance_coins -= draw.ticket_price;
      draw.payout_pool += draw.ticket_price * 0.8;
    } else {
      if (user.balance_stars < draw.ticket_price) {
        return res.status(400).json({ success: false, error: 'Insufficient Telegram Stars for ticket' });
      }
      user.balance_stars -= draw.ticket_price;
      draw.payout_pool += draw.ticket_price * 0.85;
    }
  }

  draw.ticket_count += 1;

  const ticket: LotteryTicket = {
    ticket_id: crypto.randomUUID(),
    draw_id: draw.draw_id,
    telegram_id: user.telegram_id,
    username: user.username,
    selected_numbers: sortedNumbers,
    purchase_time: new Date().toISOString()
  };
  lotteryTickets.push(ticket);

  res.json({
    success: true,
    data: {
      ticket,
      balances: {
        coins: user.balance_coins,
        stars: user.balance_stars,
        free_tickets: user.free_tickets
      },
      draw_payout_pool: draw.payout_pool
    }
  });
});

// 9. My Tickets
app.get('/api/v1/lottery/my-tickets', (req: Request, res: Response) => {
  const user = resolveTelegramUser(req);
  const myTickets = lotteryTickets
    .filter(t => t.telegram_id === user.telegram_id)
    .map(t => {
      const draw = lotteryDraws.get(t.draw_id);
      return {
        ...t,
        draw_title: draw?.title || 'Unknown Draw',
        draw_status: draw?.status || 'UNKNOWN',
        draw_time: draw?.draw_time,
        currency: draw?.currency,
        winning_numbers: draw?.winning_numbers,
      };
    })
    .reverse();

  res.json({
    success: true,
    data: myTickets
  });
});

// 10. Trigger / Execute Draw (Provably Fair Lottery Resolution)
app.post('/api/v1/lottery/trigger-draw', (req: Request, res: Response) => {
  const { draw_id } = req.body;
  const draw = lotteryDraws.get(draw_id);
  if (!draw) {
    return res.status(404).json({ success: false, error: 'Draw not found' });
  }
  if (draw.status === 'COMPLETED') {
    return res.status(400).json({ success: false, error: 'Draw already completed' });
  }

  // Derive 5 winning numbers (1 to 35) using HMAC-SHA256 of server seed
  const winningNumbers: number[] = [];
  let round = 0;
  while (winningNumbers.length < 5) {
    const hash = crypto.createHmac('sha256', draw.server_seed).update(`draw_round_${round}`).digest('hex');
    const num = (parseInt(hash.substring(0, 8), 16) % 35) + 1;
    if (!winningNumbers.includes(num)) {
      winningNumbers.push(num);
    }
    round++;
  }
  winningNumbers.sort((a, b) => a - b);

  draw.status = 'COMPLETED';
  draw.winning_numbers = winningNumbers;

  // Evaluate tickets for this draw
  const ticketsForDraw = lotteryTickets.filter(t => t.draw_id === draw_id);
  let winnersCount = 0;
  let totalDistributed = 0;

  for (const t of ticketsForDraw) {
    const matches = t.selected_numbers.filter(n => winningNumbers.includes(n)).length;
    t.matches = matches;

    let reward = 0;
    if (matches === 5) {
      reward = Math.round(draw.payout_pool * 0.70); // 70% jackpot
    } else if (matches === 4) {
      reward = Math.round(draw.payout_pool * 0.20);
    } else if (matches === 3) {
      reward = Math.round(draw.payout_pool * 0.08);
    } else if (matches >= 2) {
      reward = draw.ticket_price * 1.5;
    }

    t.payout_won = reward;
    if (reward > 0) {
      winnersCount++;
      totalDistributed += reward;
      const ticketUser = users.get(t.telegram_id);
      if (ticketUser) {
        if (draw.currency === 'COINS') {
          ticketUser.balance_coins += reward;
          // 10% referral prize commission
          processPrizeCommission(ticketUser.telegram_id, reward, `LOTTERY_${draw.title}`, users).catch(() => {});
        } else {
          ticketUser.balance_stars += reward;
        }
      }
    }
  }

  // Schedule next iteration of this draw
  const nextDrawId = `draw-${Date.now().toString(36)}`;
  const nextSeed = crypto.randomBytes(32).toString('hex');
  const nextDrawTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins

  lotteryDraws.set(nextDrawId, {
    draw_id: nextDrawId,
    title: draw.title,
    ticket_price: draw.ticket_price,
    currency: draw.currency,
    payout_pool: Math.max(500, Math.round(draw.payout_pool * 0.5)),
    status: 'OPEN',
    draw_time: nextDrawTime,
    winning_numbers: null,
    server_seed: nextSeed,
    server_seed_hash: crypto.createHash('sha256').update(nextSeed).digest('hex'),
    created_at: new Date().toISOString(),
    ticket_count: 0
  });

  res.json({
    success: true,
    data: {
      draw_id: draw.draw_id,
      title: draw.title,
      winning_numbers: winningNumbers,
      revealed_server_seed: draw.server_seed,
      server_seed_hash: draw.server_seed_hash,
      tickets_evaluated: ticketsForDraw.length,
      winners_count: winnersCount,
      total_distributed: totalDistributed,
      next_draw_id: nextDrawId
    }
  });
});

// 11. Admin API Router (RBAC, Draw Lifecycle, Spinner Engine, User Ledgers, Anti-Fraud, Financial Queue)
app.use(
  '/api/v1/admin',
  createAdminRouter({
    users,
    lotteryDraws,
    lotteryTickets,
    SPINNER_SECTORS,
    spinLogs
  })
);

// API 404 handler - prevents /api requests from falling through to HTML index
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.path}`
  });
});

// Global API error middleware
app.use((err: Error, req: Request, res: Response, next: (err?: unknown) => void) => {
  if (req.path.startsWith('/api')) {
    console.error('API Error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal Server Error'
    });
  }
  next(err);
});

// START SERVER WITH VITE INTEGRATION
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram Mini App Lotto Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
