import crypto from 'crypto';
import { getDbPool, getDbConnection, DbConnection } from './db';
import { calculateSpinResult, generateServerSeed, hashServerSeed, DEFAULT_SECTORS } from '../ProvablyFairEngine.js';
import { SpinnerSector } from '../src/types';

export interface SpinTransactionInput {
  telegramId: number;
  username: string;
  firstName: string;
  clientSeed?: string;
  useFreeTicket?: boolean;
  sectors?: SpinnerSector[];
}

export interface SpinTransactionOutput {
  winning_index: number;
  winningIndex: number;
  sector: SpinnerSector;
  animation: {
    duration_ms: number;
    total_rotations: number;
  };
  public_seed_hash: string;
  server_seed_hash: string;
  provably_fair: {
    revealed_server_seed: string;
    server_seed_hash: string;
    client_seed: string;
    nonce: number;
    outcome_hash: string;
    next_server_seed_hash: string;
  };
  balances: {
    coins: number;
    stars: number;
    free_tickets: number;
  };
}

/**
 * Executes a Provably Fair Spinner transaction.
 * 1. Begins MySQL database transaction (BEGIN ... COMMIT).
 * 2. Queries & locks user record in MySQL (FOR UPDATE) to verify token/coin balances.
 * 3. Deducts spin cost within the transaction.
 * 4. Calculates weighted winning index using calculateSpinResult from ProvablyFairEngine.
 * 5. Applies prize winnings, updates balances, sets next server seed, increments nonce.
 * 6. Logs the audit record into spinner_logs.
 * 7. Commits transaction and returns result to client.
 *
 * (Includes graceful in-memory fallback if MySQL connection is unavailable in sandbox).
 */
export async function executeSpinnerTransaction(
  input: SpinTransactionInput,
  inMemoryFallbackUser?: any,
  inMemoryLogsList?: any[]
): Promise<SpinTransactionOutput> {
  const { telegramId, username, firstName, clientSeed, useFreeTicket, sectors = DEFAULT_SECTORS } = input;
  const SPIN_COST = 10;
  const effectiveClientSeed = (clientSeed && typeof clientSeed === 'string' && clientSeed.trim())
    ? clientSeed.trim()
    : `client_seed_${telegramId}_${Date.now()}`;

  let client: DbConnection | null = null;

  try {
    getDbPool();
    // Use a quick timeout when acquiring client so offline external DB doesn't stall the request
    client = await Promise.race([
      getDbConnection(),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('DB connection timeout')), 1200))
    ]) as DbConnection;
  } catch (dbErr) {
    // If MySQL is unreachable, client remains null and we proceed with in-memory transaction
    console.warn(`[Spinner MySQL] Notice: MySQL offline (${(dbErr as Error).message}), executing in-memory store transaction.`);
  }

  if (client) {
    try {
      // 1. Begin Database Transaction
      await client.query('START TRANSACTION');

      // 2. Ensure user exists and lock the user row FOR UPDATE
      let userQuery = await client.query(
        'SELECT telegram_id, coins_balance, stars_balance, free_tickets_balance, current_server_seed, current_server_seed_hash, nonce FROM users WHERE telegram_id = ? FOR UPDATE',
        [telegramId]
      );

      if (userQuery.rows.length === 0) {
        const initialServerSeed = generateServerSeed();
        const initialSeedHash = hashServerSeed(initialServerSeed);
        await client.query(
          `INSERT INTO users (
            telegram_id, username, first_name, coins_balance, stars_balance, free_tickets_balance,
            current_server_seed, current_server_seed_hash, nonce, created_at, updated_at
          ) VALUES (?, ?, ?, 200.00, 20.00, 3, ?, ?, 0, NOW(), NOW())
          ON DUPLICATE KEY UPDATE telegram_id = telegram_id`,
          [telegramId, username || `player_${telegramId}`, firstName || 'Player', initialServerSeed, initialSeedHash]
        );

        userQuery = await client.query(
          'SELECT telegram_id, coins_balance, stars_balance, free_tickets_balance, current_server_seed, current_server_seed_hash, nonce FROM users WHERE telegram_id = ? FOR UPDATE',
          [telegramId]
        );
      }

      const dbUser = userQuery.rows[0];
      let coins = parseFloat(dbUser.coins_balance);
      let stars = parseFloat(dbUser.stars_balance);
      let freeTickets = parseInt(dbUser.free_tickets_balance, 10);
      const currentServerSeed = dbUser.current_server_seed;
      const currentServerSeedHash = dbUser.current_server_seed_hash || hashServerSeed(currentServerSeed);
      const currentNonce = parseInt(dbUser.nonce, 10);

      // 3. Balance verification & deduction
      let costAmount = SPIN_COST;
      let costCurrency = 'COINS';

      if (useFreeTicket && freeTickets > 0) {
        freeTickets -= 1;
        costAmount = 1;
        costCurrency = 'FREE_TICKET';
      } else {
        if (coins < SPIN_COST) {
          await client.query('ROLLBACK');
          const error: any = new Error('Insufficient Coins! Use the faucet or win tickets in the scheduled draw.');
          error.status = 400;
          throw error;
        }
        coins -= SPIN_COST;
      }

      // 4. Calculate spin outcome via HMAC-SHA256 ProvablyFairEngine
      const spinResult = calculateSpinResult(currentServerSeed, effectiveClientSeed, currentNonce, sectors);
      const winningSector = spinResult.sector;
      const winningIndex = spinResult.winningIndex;

      // Credit winnings
      if (winningSector.prize_type === 'COINS') {
        coins += winningSector.prize_value;
      } else if (winningSector.prize_type === 'STARS') {
        stars += winningSector.prize_value;
      } else if (winningSector.prize_type === 'FREE_TICKET' || (winningSector.prize_type as string) === 'FREE_TICKETS') {
        freeTickets += winningSector.prize_value;
      }

      // Prepare fresh seeds for next round
      const nextServerSeed = generateServerSeed();
      const nextServerSeedHash = hashServerSeed(nextServerSeed);

      // 5. Update user state in database
      await client.query(
        `UPDATE users
         SET coins_balance = ?,
             stars_balance = ?,
             free_tickets_balance = ?,
             nonce = nonce + 1,
             current_server_seed = ?,
             current_server_seed_hash = ?,
             updated_at = NOW()
         WHERE telegram_id = ?`,
        [coins, stars, freeTickets, nextServerSeed, nextServerSeedHash, telegramId]
      );

      // 6. Log outcome to spinner_logs table
      const spinId = crypto.randomUUID();
      await client.query(
        `INSERT INTO spinner_logs (
          spin_id, user_id, server_seed, server_seed_hash, client_seed,
          nonce, outcome_hash, winning_index, prize_type, prize_value,
          cost_amount, cost_currency, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          spinId,
          telegramId,
          currentServerSeed,
          currentServerSeedHash,
          effectiveClientSeed,
          currentNonce,
          spinResult.outcomeHash,
          winningIndex,
          winningSector.prize_type,
          winningSector.prize_value,
          costAmount,
          costCurrency
        ]
      );

      // 7. Commit Transaction
      await client.query('COMMIT');

      // Sync in-memory user if present
      if (inMemoryFallbackUser) {
        inMemoryFallbackUser.balance_coins = coins;
        inMemoryFallbackUser.balance_stars = stars;
        inMemoryFallbackUser.free_tickets = freeTickets;
        inMemoryFallbackUser.nonce = currentNonce + 1;
        inMemoryFallbackUser.current_server_seed = nextServerSeed;
      }

      return {
        winning_index: winningIndex,
        winningIndex: winningIndex,
        sector: winningSector,
        animation: {
          duration_ms: 4200,
          total_rotations: 8
        },
        public_seed_hash: currentServerSeedHash,
        server_seed_hash: currentServerSeedHash,
        provably_fair: {
          revealed_server_seed: currentServerSeed,
          server_seed_hash: currentServerSeedHash,
          client_seed: effectiveClientSeed,
          nonce: currentNonce,
          outcome_hash: spinResult.outcomeHash,
          next_server_seed_hash: nextServerSeedHash
        },
        balances: {
          coins,
          stars,
          free_tickets: freeTickets
        }
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- Resilient Fallback Transaction (In-Memory User Store) ---
  if (!inMemoryFallbackUser) {
    throw new Error('User record not found');
  }

  const user = inMemoryFallbackUser;
  let paidWith = 'COINS';
  let costAmount = SPIN_COST;

  if (useFreeTicket && user.free_tickets > 0) {
    user.free_tickets -= 1;
    paidWith = 'FREE_TICKET';
    costAmount = 1;
  } else {
    if (user.balance_coins < SPIN_COST) {
      const error: any = new Error('Insufficient Coins! Use the faucet or win tickets in the scheduled draw.');
      error.status = 400;
      throw error;
    }
    user.balance_coins -= SPIN_COST;
  }

  const currentServerSeed = user.current_server_seed;
  const userNonce = user.nonce;
  const currentServerSeedHash = hashServerSeed(currentServerSeed);

  // Calculate spin result using ProvablyFairEngine
  const spinResult = calculateSpinResult(currentServerSeed, effectiveClientSeed, userNonce, sectors);
  const winningSector = spinResult.sector;
  const winningIndex = spinResult.winningIndex;

  // Apply Prize
  if (winningSector.prize_type === 'COINS') {
    user.balance_coins += winningSector.prize_value;
  } else if (winningSector.prize_type === 'STARS') {
    user.balance_stars += winningSector.prize_value;
  } else if (winningSector.prize_type === 'FREE_TICKET' || (winningSector.prize_type as string) === 'FREE_TICKETS') {
    user.free_tickets += winningSector.prize_value;
  }

  // Increment user nonce and generate next server seed
  user.nonce += 1;
  const nextServerSeed = generateServerSeed();
  user.current_server_seed = nextServerSeed;
  const nextServerSeedHash = hashServerSeed(nextServerSeed);

  if (inMemoryLogsList) {
    inMemoryLogsList.unshift({
      spin_id: crypto.randomUUID(),
      telegram_id: user.telegram_id,
      sector_id: winningSector.id,
      sector_label: winningSector.label,
      prize_type: winningSector.prize_type,
      prize_value: winningSector.prize_value,
      server_seed: currentServerSeed,
      server_seed_hash: currentServerSeedHash,
      client_seed: effectiveClientSeed,
      nonce: userNonce,
      outcome_hash: spinResult.outcomeHash,
      spin_time: new Date().toISOString()
    });
  }

  return {
    winning_index: winningIndex,
    winningIndex: winningIndex,
    sector: winningSector,
    animation: {
      duration_ms: 4200,
      total_rotations: 8
    },
    public_seed_hash: currentServerSeedHash,
    server_seed_hash: currentServerSeedHash,
    provably_fair: {
      revealed_server_seed: currentServerSeed,
      server_seed_hash: currentServerSeedHash,
      client_seed: effectiveClientSeed,
      nonce: userNonce,
      outcome_hash: spinResult.outcomeHash,
      next_server_seed_hash: nextServerSeedHash
    },
    balances: {
      coins: user.balance_coins,
      stars: user.balance_stars,
      free_tickets: user.free_tickets
    }
  };
}
