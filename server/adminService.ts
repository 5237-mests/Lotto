import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { query } from './db';
import { calculateSpinResult, hashServerSeed } from '../ProvablyFairEngine.js';

export type AdminRole = 'SUPER_ADMIN' | 'LOTTERY_MANAGER' | 'FINANCE_OFFICER' | 'SUPPORT';

export interface AdminUser {
  admin_id: string;
  username: string;
  email: string;
  role: AdminRole;
  is_mfa_enabled: boolean;
  created_at: string;
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

// In-Memory Admin Stores with Initial Demo Data
export const adminUsers: AdminUser[] = [
  {
    admin_id: 'a0000000-0000-0000-0000-000000000001',
    username: 'superadmin',
    email: 'admin@telegramlottery.io',
    role: 'SUPER_ADMIN',
    is_mfa_enabled: true,
    created_at: new Date().toISOString()
  },
  {
    admin_id: 'a0000000-0000-0000-0000-000000000002',
    username: 'manager',
    email: 'manager@telegramlottery.io',
    role: 'LOTTERY_MANAGER',
    is_mfa_enabled: false,
    created_at: new Date().toISOString()
  },
  {
    admin_id: 'a0000000-0000-0000-0000-000000000003',
    username: 'finance',
    email: 'finance@telegramlottery.io',
    role: 'FINANCE_OFFICER',
    is_mfa_enabled: false,
    created_at: new Date().toISOString()
  },
  {
    admin_id: 'a0000000-0000-0000-0000-000000000004',
    username: 'support',
    email: 'support@telegramlottery.io',
    role: 'SUPPORT',
    is_mfa_enabled: false,
    created_at: new Date().toISOString()
  }
];

export const adminAuditLogs: AdminAuditLog[] = [
  {
    log_id: 'log-seed-001',
    admin_id: 'a0000000-0000-0000-0000-000000000001',
    admin_username: 'superadmin',
    action: 'SYSTEM_INITIALIZATION',
    target_resource: 'system:core',
    payload: { version: '1.0.0', rtp_baseline: 0.845 },
    ip_address: '127.0.0.1',
    timestamp: new Date(Date.now() - 3600 * 1000 * 4).toISOString()
  }
];

export const withdrawalRequests: WithdrawalRequest[] = [
  {
    request_id: 'wdr-101',
    telegram_id: 7770001,
    username: 'alice_crypto',
    amount: 25.5,
    currency: 'TON',
    destination_wallet: 'UQDD8...TON_WALLET_ADDR',
    status: 'PENDING',
    created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString()
  },
  {
    request_id: 'wdr-102',
    telegram_id: 7770002,
    username: 'bob_lotto',
    amount: 150,
    currency: 'STARS',
    destination_wallet: 'telegram:bob_lotto',
    status: 'APPROVED',
    processed_by: 'finance',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    processed_at: new Date(Date.now() - 1000 * 60 * 90).toISOString()
  }
];

/**
 * Record immutable administrative audit log
 */
export async function recordAdminAudit(
  admin: { admin_id: string; username: string },
  action: string,
  targetResource: string,
  payload: any,
  ipAddress = '127.0.0.1'
): Promise<AdminAuditLog> {
  const log: AdminAuditLog = {
    log_id: `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    admin_id: admin.admin_id,
    admin_username: admin.username,
    action,
    target_resource: targetResource,
    payload,
    ip_address: ipAddress,
    timestamp: new Date().toISOString()
  };

  adminAuditLogs.unshift(log);
  if (adminAuditLogs.length > 500) {
    adminAuditLogs.pop();
  }

  // Persist to Postgres if available
  try {
    await query(
      `INSERT INTO admin_audit_logs (log_id, admin_id, admin_username, action, target_resource, payload, ip_address, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        log.log_id,
        log.admin_id.startsWith('a0000') ? null : log.admin_id, // handle mock vs valid uuid
        log.admin_username,
        log.action,
        log.target_resource,
        JSON.stringify(log.payload),
        log.ip_address,
        log.timestamp
      ]
    );
  } catch (err) {
    // Graceful fallback to memory
  }

  return log;
}

/**
 * Monte Carlo Simulation Engine for Wheel of Fortune RTP
 * Runs N iterations to calculate empirical RTP, hit frequency, and house margin
 */
export function runMonteCarloRtpSimulation(
  sectors: Array<{ id: number; label: string; weight: number; prize_type: string; prize_value: number }>,
  iterations = 1000000,
  costPerSpin = 10
) {
  const totalWeight = sectors.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Total weight must be greater than zero');
  }

  // Pre-calculate cumulative thresholds
  const cumulative: Array<{ sector: any; threshold: number }> = [];
  let cum = 0;
  for (const s of sectors) {
    cum += s.weight;
    cumulative.push({ sector: s, threshold: cum });
  }

  const hits: Record<number, { count: number; prize_type: string; label: string; prize_value: number }> = {};
  for (const s of sectors) {
    hits[s.id] = { count: 0, prize_type: s.prize_type, label: s.label, prize_value: s.prize_value };
  }

  let totalPayout = 0;
  const totalCost = iterations * costPerSpin;

  // Run Monte Carlo simulation batch
  // For high performance, use random numbers and cumulative binary search / threshold check
  for (let i = 0; i < iterations; i++) {
    const roll = Math.random() * totalWeight;
    for (let c = 0; c < cumulative.length; c++) {
      if (roll <= cumulative[c].threshold) {
        const sec = cumulative[c].sector;
        hits[sec.id].count++;
        // Calculate payout value: Free tickets estimated at 10 coins value
        const val = sec.prize_type === 'COINS'
          ? sec.prize_value
          : sec.prize_type === 'FREE_TICKET' || sec.prize_type === 'FREE_TICKETS'
            ? sec.prize_value * 10
            : 0;
        totalPayout += val;
        break;
      }
    }
  }

  const simulatedRtp = (totalPayout / totalCost) * 100;
  const houseEdge = 100 - simulatedRtp;

  // Theoretical Calculation
  let theoreticalPayout = 0;
  const sectorProbabilities = sectors.map((s) => {
    const prob = (s.weight / totalWeight) * 100;
    const hitCount = hits[s.id].count;
    const empiricalProb = (hitCount / iterations) * 100;
    const effectiveValue = s.prize_type === 'COINS' ? s.prize_value : (s.prize_type.includes('TICKET') ? s.prize_value * 10 : 0);
    theoreticalPayout += (s.weight / totalWeight) * effectiveValue;
    return {
      sector_id: s.id,
      label: s.label,
      weight: s.weight,
      prize_type: s.prize_type,
      prize_value: s.prize_value,
      theoretical_win_rate: Number(prob.toFixed(3)),
      empirical_win_rate: Number(empiricalProb.toFixed(3)),
      total_hits: hitCount
    };
  });

  const theoreticalRtp = (theoreticalPayout / costPerSpin) * 100;

  return {
    iterations,
    cost_per_spin: costPerSpin,
    total_wagered: totalCost,
    total_payout_distributed: totalPayout,
    theoretical_rtp: `${theoreticalRtp.toFixed(2)}%`,
    theoretical_rtp_numeric: Number(theoreticalRtp.toFixed(2)),
    simulated_rtp: `${simulatedRtp.toFixed(2)}%`,
    simulated_rtp_numeric: Number(simulatedRtp.toFixed(2)),
    house_edge: `${houseEdge.toFixed(2)}%`,
    house_edge_numeric: Number(houseEdge.toFixed(2)),
    is_house_profitable: houseEdge > 0,
    sector_breakdown: sectorProbabilities
  };
}

/**
 * Factory for creating the Admin Router with references to live server data structures
 */
export function createAdminRouter(serverContext: {
  users: Map<number, any>;
  lotteryDraws: Map<string, any>;
  lotteryTickets: any[];
  SPINNER_SECTORS: any[];
  spinLogs: any[];
}) {
  const router = express.Router();
  const { users, lotteryDraws, lotteryTickets, SPINNER_SECTORS, spinLogs } = serverContext;

  // Helper to extract IP
  const getClientIp = (req: Request) =>
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';

  // Admin Auth Middleware: Reads Authorization header or defaults to SuperAdmin for seamless TMA dev
  const requireAdmin = (allowedRoles?: AdminRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers['authorization'];
      const roleHeader = req.headers['x-admin-role'] as AdminRole | undefined;

      // Extract admin identity
      let currentAdmin: AdminUser | undefined = adminUsers[0]; // Default to superadmin
      if (roleHeader) {
        const matched = adminUsers.find((u) => u.role === roleHeader);
        if (matched) currentAdmin = matched;
      } else if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        // Simple token matching
        const matched = adminUsers.find((u) => u.username === token || `mock_jwt_${u.username}` === token);
        if (matched) currentAdmin = matched;
      }

      if (!currentAdmin) {
        return res.status(401).json({ success: false, error: 'Unauthorized admin access' });
      }

      if (allowedRoles && !allowedRoles.includes(currentAdmin.role)) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: Action requires one of [${allowedRoles.join(', ')}] role. Current: ${currentAdmin.role}`
        });
      }

      (req as any).admin = currentAdmin;
      next();
    };
  };

  // ============================================================================
  // 1. ADMIN AUTH & SESSION ENDPOINTS
  // ============================================================================
  router.post('/auth/login', (req: Request, res: Response) => {
    const { username, password, mfa_code } = req.body;
    const admin = adminUsers.find((u) => u.username.toLowerCase() === (username || '').toLowerCase());

    if (!admin) {
      return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    }

    // Check MFA if enabled
    if (admin.is_mfa_enabled && mfa_code && mfa_code !== '123456' && mfa_code.length !== 6) {
      return res.status(401).json({ success: false, error: 'Invalid MFA verification code' });
    }

    const token = `adm_token_${admin.username}_${Date.now()}`;
    recordAdminAudit(admin, 'ADMIN_LOGIN', `admin:${admin.username}`, { ip: getClientIp(req) }, getClientIp(req));

    res.json({
      success: true,
      data: {
        token,
        admin: {
          admin_id: admin.admin_id,
          username: admin.username,
          email: admin.email,
          role: admin.role,
          is_mfa_enabled: admin.is_mfa_enabled
        }
      }
    });
  });

  router.get('/auth/me', requireAdmin(), (req: Request, res: Response) => {
    const admin: AdminUser = (req as any).admin;
    res.json({
      success: true,
      data: admin
    });
  });

  // ============================================================================
  // 2. DASHBOARD SUMMARY METRICS (KPIS)
  // ============================================================================
  router.get('/metrics', requireAdmin(), (req: Request, res: Response) => {
    // 1. GGR Calculation: (Ticket Sales + Spin Costs) - (Ticket Payouts + Spin Coin Payouts)
    let totalTicketRevenue = 0;
    let totalTicketPayouts = 0;
    for (const t of lotteryTickets) {
      const draw = lotteryDraws.get(t.draw_id);
      totalTicketRevenue += draw?.ticket_price || 10;
      totalTicketPayouts += t.payout_won || 0;
    }

    let totalSpinRevenue = 0;
    let totalSpinPayouts = 0;
    for (const log of spinLogs) {
      totalSpinRevenue += 10; // Standard 10 coins cost
      if (log.prize_type === 'COINS') {
        totalSpinPayouts += log.prize_value;
      }
    }

    const totalTurnover = totalTicketRevenue + totalSpinRevenue;
    const totalPayoutsPaid = totalTicketPayouts + totalSpinPayouts;
    const ggr = totalTurnover - totalPayoutsPaid;

    // 2. House Margin for Spinner
    const actualSpinnerRtp = totalSpinRevenue > 0 ? (totalSpinPayouts / totalSpinRevenue) * 100 : 0;
    const theoreticalRtpSimulation = runMonteCarloRtpSimulation(SPINNER_SECTORS, 10000, 10);

    // 3. Active Draw Pool
    let activeDrawPool = 0;
    let openDrawsCount = 0;
    for (const draw of lotteryDraws.values()) {
      if (draw.status === 'OPEN') {
        activeDrawPool += draw.payout_pool;
        openDrawsCount++;
      }
    }

    // 4. User stats (DAU / MAU)
    const userList = Array.from(users.values());
    const totalUsers = userList.length;
    const bannedUsers = userList.filter((u: any) => u.is_banned).length;

    // 5. Withdrawal requests
    const pendingWithdrawals = withdrawalRequests.filter((w) => w.status === 'PENDING').length;

    res.json({
      success: true,
      data: {
        financials: {
          ggr: Number(ggr.toFixed(2)),
          total_turnover: Number(totalTurnover.toFixed(2)),
          total_payouts_paid: Number(totalPayoutsPaid.toFixed(2)),
          profit_margin_pct: totalTurnover > 0 ? Number(((ggr / totalTurnover) * 100).toFixed(1)) : 0
        },
        users: {
          total_registered: totalUsers,
          dau_estimate: Math.max(totalUsers, 1),
          mau_estimate: Math.max(totalUsers * 3, 5),
          banned_users: bannedUsers
        },
        spinner_analytics: {
          total_spins: spinLogs.length,
          theoretical_rtp: theoreticalRtpSimulation.theoretical_rtp,
          actual_rtp: `${actualSpinnerRtp.toFixed(1)}%`,
          house_margin: `${(100 - actualSpinnerRtp).toFixed(1)}%`
        },
        lottery_analytics: {
          open_draws: openDrawsCount,
          active_draw_pool: activeDrawPool,
          total_tickets_sold: lotteryTickets.length
        },
        financial_queue: {
          pending_withdrawals: pendingWithdrawals
        }
      }
    });
  });

  // ============================================================================
  // 3. SCHEDULED LOTTERY DRAW MANAGEMENT (SECTION 2.1)
  // ============================================================================
  router.get('/draws', requireAdmin(), (req: Request, res: Response) => {
    const draws = Array.from(lotteryDraws.values()).map((d) => {
      const tickets = lotteryTickets.filter((t) => t.draw_id === d.draw_id);
      return {
        ...d,
        purchased_tickets: tickets.length
      };
    });

    res.json({ success: true, data: draws });
  });

  // Create new draw
  router.post('/draws', requireAdmin(['SUPER_ADMIN', 'LOTTERY_MANAGER']), async (req: Request, res: Response) => {
    const admin: AdminUser = (req as any).admin;
    const { title, ticket_price, currency, payout_pool, draw_time_minutes = 60, multi_tier_rules } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Draw title is required' });
    }

    const drawId = `draw-${Date.now().toString(36)}`;
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = hashServerSeed(serverSeed);
    const drawTime = new Date(Date.now() + Number(draw_time_minutes) * 60 * 1000).toISOString();

    const newDraw = {
      draw_id: drawId,
      title: title.trim(),
      ticket_price: Number(ticket_price) || 10,
      currency: currency === 'STARS' ? 'STARS' : 'COINS',
      payout_pool: Number(payout_pool) || 1000,
      status: 'OPEN',
      draw_time: drawTime,
      winning_numbers: null,
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      created_at: new Date().toISOString(),
      ticket_count: 0,
      multi_tier_rules: multi_tier_rules || {
        match_5: 0.70, // 70% pool
        match_4: 0.20, // 20% pool
        match_3: 0.08, // 8% pool
        match_2: 1.5   // 1.5x ticket cost
      }
    };

    lotteryDraws.set(drawId, newDraw);

    await recordAdminAudit(
      admin,
      'CREATE_LOTTERY_DRAW',
      `draws:${drawId}`,
      { title: newDraw.title, ticket_price: newDraw.ticket_price, pool: newDraw.payout_pool },
      getClientIp(req)
    );

    res.json({
      success: true,
      message: 'Lottery draw scheduled and opened successfully',
      data: newDraw
    });
  });

  // Lifecycle control: OPEN, LOCKED, or update draw
  router.put('/draws/:draw_id/status', requireAdmin(['SUPER_ADMIN', 'LOTTERY_MANAGER']), async (req: Request, res: Response) => {
    const admin: AdminUser = (req as any).admin;
    const { draw_id } = req.params;
    const { status } = req.body;

    const draw = lotteryDraws.get(draw_id);
    if (!draw) {
      return res.status(404).json({ success: false, error: 'Draw not found' });
    }

    if (!['OPEN', 'LOCKED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status transition. Use execute or cancel endpoint for completion.' });
    }

    const prevStatus = draw.status;
    draw.status = status;

    await recordAdminAudit(
      admin,
      'UPDATE_DRAW_STATUS',
      `draws:${draw_id}`,
      { previous: prevStatus, new: status },
      getClientIp(req)
    );

    res.json({
      success: true,
      message: `Draw status updated to ${status}`,
      data: draw
    });
  });

  // FORCE DRAW: Immediate Winning Number Execution & Payout Distribution
  router.post('/draws/:draw_id/execute', requireAdmin(['SUPER_ADMIN', 'LOTTERY_MANAGER']), async (req: Request, res: Response) => {
    const admin: AdminUser = (req as any).admin;
    const { draw_id } = req.params;

    const draw = lotteryDraws.get(draw_id);
    if (!draw) {
      return res.status(404).json({ success: false, error: 'Draw not found' });
    }

    if (draw.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Draw is already completed' });
    }

    // Cryptographically derive 5 unique winning numbers between 1 and 35 using server seed HMAC
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

    // Evaluate tickets & distribute prizes
    const ticketsForDraw = lotteryTickets.filter((t) => t.draw_id === draw_id);
    let winnersCount = 0;
    let totalDistributed = 0;

    for (const t of ticketsForDraw) {
      const matches = t.selected_numbers.filter((n: number) => winningNumbers.includes(n)).length;
      t.matches = matches;

      let reward = 0;
      if (matches === 5) {
        reward = Math.round(draw.payout_pool * 0.70);
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
        const player = users.get(t.telegram_id);
        if (player) {
          if (draw.currency === 'COINS') {
            player.balance_coins += reward;
          } else {
            player.balance_stars += reward;
          }
        }
      }
    }

    await recordAdminAudit(
      admin,
      'FORCE_DRAW_EXECUTION',
      `draws:${draw_id}`,
      {
        winning_numbers: winningNumbers,
        tickets_count: ticketsForDraw.length,
        winners_count: winnersCount,
        total_payout: totalDistributed
      },
      getClientIp(req)
    );

    res.json({
      success: true,
      data: {
        draw_id: draw.draw_id,
        status: 'COMPLETED',
        winning_numbers: winningNumbers,
        revealed_server_seed: draw.server_seed,
        server_seed_hash: draw.server_seed_hash,
        total_payout: totalDistributed,
        winning_tickets_count: winnersCount,
        tickets_evaluated: ticketsForDraw.length
      }
    });
  });

  // CANCEL / REFUND: Abort draw and credit funds back to user accounts
  router.post('/draws/:draw_id/cancel', requireAdmin(['SUPER_ADMIN']), async (req: Request, res: Response) => {
    const admin: AdminUser = (req as any).admin;
    const { draw_id } = req.params;
    const { memo = 'Draw cancelled by administrator' } = req.body;

    const draw = lotteryDraws.get(draw_id);
    if (!draw) {
      return res.status(404).json({ success: false, error: 'Draw not found' });
    }

    if (draw.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Completed draws cannot be refunded' });
    }

    const ticketsForDraw = lotteryTickets.filter((t) => t.draw_id === draw_id);
    let refundedCount = 0;
    let refundedAmount = 0;

    for (const t of ticketsForDraw) {
      const player = users.get(t.telegram_id);
      if (player) {
        if (draw.currency === 'COINS') {
          player.balance_coins += draw.ticket_price;
        } else {
          player.balance_stars += draw.ticket_price;
        }
        refundedCount++;
        refundedAmount += draw.ticket_price;
      }
      t.status = 'REFUNDED';
    }

    draw.status = 'CANCELLED';

    await recordAdminAudit(
      admin,
      'CANCEL_AND_REFUND_DRAW',
      `draws:${draw_id}`,
      { memo, refunded_tickets: refundedCount, total_refunded: refundedAmount },
      getClientIp(req)
    );

    res.json({
      success: true,
      message: `Draw cancelled. Refunded ${refundedCount} tickets (${refundedAmount} ${draw.currency}) to player accounts.`,
      data: {
        draw_id,
        refunded_tickets: refundedCount,
        refunded_amount: refundedAmount
      }
    });
  });

  // ============================================================================
  // 4. INSTANT SPINNER MANAGEMENT ENGINE & RTP SIMULATOR (SECTION 2.2)
  // ============================================================================
  router.get('/spinner/sectors', requireAdmin(), (req: Request, res: Response) => {
    const simulation = runMonteCarloRtpSimulation(SPINNER_SECTORS, 10000, 10);
    res.json({
      success: true,
      data: {
        sectors: SPINNER_SECTORS,
        simulation
      }
    });
  });

  // Update Sector Configuration & Weights
  router.put('/spinner/sectors', requireAdmin(['SUPER_ADMIN', 'LOTTERY_MANAGER']), async (req: Request, res: Response) => {
    const admin: AdminUser = (req as any).admin;
    const { sectors } = req.body;

    if (!Array.isArray(sectors) || sectors.length === 0) {
      return res.status(400).json({ success: false, error: 'Sectors array is required' });
    }

    // Validate sector structure
    for (const s of sectors) {
      if (typeof s.weight !== 'number' || s.weight < 1) {
        return res.status(400).json({ success: false, error: `Invalid weight for sector ${s.label || s.id}` });
      }
      if (!['NO_WIN', 'COINS', 'FREE_TICKET', 'STARS'].includes(s.prize_type)) {
        return res.status(400).json({ success: false, error: `Invalid prize type ${s.prize_type}` });
      }
    }

    // Mutate live array in place
    SPINNER_SECTORS.length = 0;
    sectors.forEach((s: any, idx: number) => {
      SPINNER_SECTORS.push({
        id: typeof s.id === 'number' ? s.id : (typeof s.sector_id === 'number' ? s.sector_id : idx),
        label: s.label || `Sector ${idx}`,
        weight: Math.round(s.weight),
        prize_type: s.prize_type,
        prize_value: Number(s.prize_value) || 0,
        color: s.color || '#0284C7'
      });
    });

    const simulation = runMonteCarloRtpSimulation(SPINNER_SECTORS, 100000, 10);

    await recordAdminAudit(
      admin,
      'UPDATE_SPINNER_WEIGHTS',
      'spinner:sectors',
      { sectors_count: SPINNER_SECTORS.length, simulated_rtp: simulation.simulated_rtp },
      getClientIp(req)
    );

    res.json({
      success: true,
      message: 'Spinner configuration updated and cached successfully.',
      calculated_rtp: simulation.theoretical_rtp,
      data: {
        sectors: SPINNER_SECTORS,
        simulation
      }
    });
  });

  // Monte Carlo Simulation Endpoint (Can simulate up to 1,000,000 spins)
  router.post('/spinner/simulate-rtp', requireAdmin(), (req: Request, res: Response) => {
    const { sectors, iterations = 100000, cost_per_spin = 10 } = req.body;
    const targetSectors = Array.isArray(sectors) && sectors.length > 0 ? sectors : SPINNER_SECTORS;

    try {
      const simulation = runMonteCarloRtpSimulation(
        targetSectors,
        Math.min(Math.max(Number(iterations) || 10000, 1000), 1000000),
        Number(cost_per_spin) || 10
      );

      res.json({
        success: true,
        data: simulation
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // 5. USER MANAGEMENT & LEDGER CONTROLS (SECTION 2.3)
  // ============================================================================
  router.get('/users', requireAdmin(), (req: Request, res: Response) => {
    const queryStr = (req.query.search as string || '').toLowerCase().trim();
    const userList = Array.from(users.values());

    const filtered = userList.filter((u) => {
      if (!queryStr) return true;
      return (
        u.telegram_id.toString().includes(queryStr) ||
        (u.username && u.username.toLowerCase().includes(queryStr)) ||
        (u.first_name && u.first_name.toLowerCase().includes(queryStr))
      );
    });

    const enriched = filtered.map((u) => {
      const tickets = lotteryTickets.filter((t) => t.telegram_id === u.telegram_id);
      const spins = spinLogs.filter((s) => s.telegram_id === u.telegram_id);

      let totalSpent = tickets.length * 10 + spins.length * 10;
      let totalWon = 0;
      for (const t of tickets) totalWon += t.payout_won || 0;
      for (const s of spins) {
        if (s.prize_type === 'COINS') totalWon += s.prize_value;
      }

      return {
        telegram_id: u.telegram_id,
        username: u.username,
        first_name: u.first_name,
        balance_coins: u.balance_coins,
        balance_stars: u.balance_stars,
        free_tickets: u.free_tickets,
        nonce: u.nonce,
        is_banned: Boolean((u as any).is_banned),
        total_spent: totalSpent,
        total_won: totalWon,
        net_profit: totalWon - totalSpent,
        tickets_count: tickets.length,
        spins_count: spins.length,
        created_at: u.created_at
      };
    });

    res.json({ success: true, data: enriched });
  });

  // User Profile Detail
  router.get('/users/:telegram_id', requireAdmin(), (req: Request, res: Response) => {
    const userId = Number(req.params.telegram_id);
    const user = users.get(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const tickets = lotteryTickets.filter((t) => t.telegram_id === userId);
    const spins = spinLogs.filter((s) => s.telegram_id === userId).slice(0, 30);

    res.json({
      success: true,
      data: {
        user,
        tickets,
        recent_spins: spins
      }
    });
  });

  // Manual Balance Adjustment with Mandatory Audit Memo
  router.post('/users/:telegram_id/adjust-balance', requireAdmin(['SUPER_ADMIN', 'FINANCE_OFFICER']), async (req: Request, res: Response) => {
    const admin: AdminUser = (req as any).admin;
    const userId = Number(req.params.telegram_id);
    const { currency, amount, operation, memo } = req.body;

    if (!memo || memo.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'A mandatory internal memo is required for balance adjustments' });
    }

    const user = users.get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const numericAmount = Math.abs(Number(amount));
    if (isNaN(numericAmount) || numericAmount === 0) {
      return res.status(400).json({ success: false, error: 'Valid adjustment amount required' });
    }

    const factor = operation === 'DEDUCT' ? -1 : 1;
    const delta = numericAmount * factor;

    if (currency === 'COINS') {
      if (factor === -1 && user.balance_coins < numericAmount) {
        return res.status(400).json({ success: false, error: 'Deduction exceeds user coins balance' });
      }
      user.balance_coins += delta;
    } else if (currency === 'STARS') {
      if (factor === -1 && user.balance_stars < numericAmount) {
        return res.status(400).json({ success: false, error: 'Deduction exceeds user stars balance' });
      }
      user.balance_stars += delta;
    } else if (currency === 'FREE_TICKETS') {
      if (factor === -1 && user.free_tickets < numericAmount) {
        return res.status(400).json({ success: false, error: 'Deduction exceeds user tickets balance' });
      }
      user.free_tickets += delta;
    } else {
      return res.status(400).json({ success: false, error: 'Invalid currency' });
    }

    await recordAdminAudit(
      admin,
      'MANUAL_BALANCE_ADJUSTMENT',
      `users:${userId}`,
      { currency, delta, memo, current_balances: { coins: user.balance_coins, stars: user.balance_stars, tickets: user.free_tickets } },
      getClientIp(req)
    );

    res.json({
      success: true,
      message: `Adjusted user #${userId} balance by ${delta > 0 ? '+' : ''}${delta} ${currency}`,
      data: {
        telegram_id: user.telegram_id,
        balance_coins: user.balance_coins,
        balance_stars: user.balance_stars,
        free_tickets: user.free_tickets
      }
    });
  });

  // Ban / Unban User
  router.post('/users/:telegram_id/toggle-ban', requireAdmin(['SUPER_ADMIN', 'SUPPORT']), async (req: Request, res: Response) => {
    const admin: AdminUser = (req as any).admin;
    const userId = Number(req.params.telegram_id);
    const { memo = 'Status updated by admin' } = req.body;

    const user = users.get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const currentBan = Boolean((user as any).is_banned);
    (user as any).is_banned = !currentBan;

    await recordAdminAudit(
      admin,
      (user as any).is_banned ? 'BAN_USER' : 'UNBAN_USER',
      `users:${userId}`,
      { memo, new_status: (user as any).is_banned ? 'BANNED' : 'ACTIVE' },
      getClientIp(req)
    );

    res.json({
      success: true,
      message: `User #${userId} is now ${(user as any).is_banned ? 'BANNED' : 'ACTIVE'}`,
      is_banned: (user as any).is_banned
    });
  });

  // ============================================================================
  // 6. WITHDRAWAL REQUESTS & FINANCIAL APPROVAL QUEUE (SECTION 3)
  // ============================================================================
  router.get('/withdrawals', requireAdmin(), (req: Request, res: Response) => {
    res.json({ success: true, data: withdrawalRequests });
  });

  router.post('/withdrawals/:request_id/action', requireAdmin(['SUPER_ADMIN', 'FINANCE_OFFICER']), async (req: Request, res: Response) => {
    const admin: AdminUser = (req as any).admin;
    const { request_id } = req.params;
    const { action, notes } = req.body; // APPROVE, REJECT, PROCESS

    const item = withdrawalRequests.find((w) => w.request_id === request_id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Withdrawal request not found' });
    }

    if (!['APPROVED', 'REJECTED', 'PROCESSED'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    item.status = action;
    item.processed_by = admin.username;
    item.processed_at = new Date().toISOString();
    if (notes) item.notes = notes;

    await recordAdminAudit(
      admin,
      `WITHDRAWAL_${action}`,
      `withdrawals:${request_id}`,
      { amount: item.amount, currency: item.currency, notes },
      getClientIp(req)
    );

    res.json({
      success: true,
      message: `Withdrawal request marked as ${action}`,
      data: item
    });
  });

  // ============================================================================
  // 7. ANTI-FRAUD & PROVABLY FAIR VERIFICATION MODULE (SECTION 2.4)
  // ============================================================================
  // Seed Audit Tool: Inspect Spin or Draw Integrity
  router.post('/audit/verify-seed', requireAdmin(), (req: Request, res: Response) => {
    const { server_seed, client_seed, nonce, type = 'SPINNER' } = req.body;

    if (!server_seed || !client_seed) {
      return res.status(400).json({ success: false, error: 'Server seed and client seed are required' });
    }

    try {
      if (type === 'SPINNER') {
        const result = calculateSpinResult(server_seed, client_seed, Number(nonce) || 0, SPINNER_SECTORS);
        return res.json({
          success: true,
          data: {
            is_valid: true,
            derived_server_seed_hash: result.serverSeedHash,
            hmac_outcome_hash: result.outcomeHash,
            winning_index: result.winningIndex,
            winning_sector: result.sector
          }
        });
      } else {
        // Lottery verification
        const winningNumbers: number[] = [];
        let round = 0;
        while (winningNumbers.length < 5) {
          const hash = crypto.createHmac('sha256', server_seed).update(`draw_round_${round}`).digest('hex');
          const num = (parseInt(hash.substring(0, 8), 16) % 35) + 1;
          if (!winningNumbers.includes(num)) winningNumbers.push(num);
          round++;
        }
        winningNumbers.sort((a, b) => a - b);

        return res.json({
          success: true,
          data: {
            is_valid: true,
            server_seed_hash: hashServerSeed(server_seed),
            derived_winning_numbers: winningNumbers
          }
        });
      }
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Anomaly Detection: Detect velocity spikes & jackpot clustering
  router.get('/audit/anomalies', requireAdmin(), (req: Request, res: Response) => {
    const anomalies: Array<{
      id: string;
      telegram_id: number;
      username: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
      reason: string;
      details: string;
      timestamp: string;
    }> = [];

    // Analyze spin logs for win frequency in recent window
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;

    const userSpinMap = new Map<number, any[]>();
    for (const log of spinLogs) {
      const logTime = new Date(log.spin_time).getTime();
      if (logTime >= tenMinutesAgo) {
        if (!userSpinMap.has(log.telegram_id)) userSpinMap.set(log.telegram_id, []);
        userSpinMap.get(log.telegram_id)!.push(log);
      }
    }

    userSpinMap.forEach((logs, uId) => {
      const jackpots = logs.filter((l) => l.prize_value >= 500);
      const wins = logs.filter((l) => l.prize_type !== 'NO_WIN');

      if (jackpots.length >= 3) {
        anomalies.push({
          id: `anom-${uId}-jp`,
          telegram_id: uId,
          username: users.get(uId)?.username || 'Unknown',
          severity: 'HIGH',
          reason: 'Excessive Jackpot Velocity Detected',
          details: `${jackpots.length} Jackpots hit within the last 10 minutes (${logs.length} total spins).`,
          timestamp: new Date().toISOString()
        });
      } else if (logs.length > 50) {
        anomalies.push({
          id: `anom-${uId}-freq`,
          telegram_id: uId,
          username: users.get(uId)?.username || 'Unknown',
          severity: 'MEDIUM',
          reason: 'High Frequency Bot Spin Pattern',
          details: `${logs.length} spins executed in under 10 minutes.`,
          timestamp: new Date().toISOString()
        });
      }
    });

    res.json({ success: true, data: anomalies });
  });

  // Immutable Admin Audit Logs
  router.get('/audit/logs', requireAdmin(), (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    res.json({
      success: true,
      data: adminAuditLogs.slice(0, limit)
    });
  });

  return router;
}
