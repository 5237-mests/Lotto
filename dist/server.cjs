"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express3 = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_crypto6 = __toESM(require("crypto"), 1);
var import_vite = require("vite");

// server/auth.ts
var import_crypto = __toESM(require("crypto"), 1);
function validateTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || typeof initData !== "string") {
    return { valid: false, error: "Missing initData" };
  }
  if (!botToken) {
    return { valid: false, error: "Missing BOT_TOKEN server configuration" };
  }
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      return { valid: false, error: "Missing hash parameter in initData" };
    }
    const authDateStr = params.get("auth_date");
    if (!authDateStr) {
      return { valid: false, error: "Missing auth_date parameter in initData" };
    }
    const authDate = parseInt(authDateStr, 10);
    if (isNaN(authDate)) {
      return { valid: false, error: "Invalid auth_date parameter in initData" };
    }
    if (maxAgeSeconds > 0) {
      const currentTimestamp = Math.floor(Date.now() / 1e3);
      if (currentTimestamp - authDate > maxAgeSeconds) {
        return { valid: false, error: "InitData has expired" };
      }
    }
    const keys = [];
    const rawParams = {};
    params.forEach((value, key) => {
      rawParams[key] = value;
      if (key !== "hash") {
        keys.push(key);
      }
    });
    keys.sort();
    const dataCheckString = keys.map((key) => `${key}=${rawParams[key]}`).join("\n");
    const secretKey = import_crypto.default.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = import_crypto.default.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    const hashBuffer = Buffer.from(hash, "utf-8");
    const calculatedBuffer = Buffer.from(calculatedHash, "utf-8");
    if (hashBuffer.length !== calculatedBuffer.length || !import_crypto.default.timingSafeEqual(hashBuffer, calculatedBuffer)) {
      return { valid: false, error: "Invalid HMAC signature" };
    }
    let user;
    const userStr = rawParams.user;
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch {
        return { valid: false, error: "Malformed user payload in initData" };
      }
    }
    return {
      valid: true,
      data: {
        user,
        query_id: rawParams.query_id,
        auth_date: authDate,
        hash,
        rawParams
      }
    };
  } catch (err) {
    return { valid: false, error: err?.message || "Verification failed" };
  }
}

// ProvablyFairEngine.js
var import_crypto2 = __toESM(require("crypto"), 1);
var DEFAULT_SECTORS = [
  { id: 0, label: "Try Again", weight: 400, prize_type: "NO_WIN", prize_value: 0, color: "#1E293B" },
  { id: 1, label: "10 Coins", weight: 300, prize_type: "COINS", prize_value: 10, color: "#0EA5E9" },
  { id: 2, label: "1 Free Ticket", weight: 200, prize_type: "FREE_TICKET", prize_value: 1, color: "#10B981" },
  { id: 3, label: "50 Coins", weight: 90, prize_type: "COINS", prize_value: 50, color: "#F59E0B" },
  { id: 4, label: "JACKPOT (500)", weight: 10, prize_type: "COINS", prize_value: 500, color: "#EF4444" }
];
function generateServerSeed() {
  return import_crypto2.default.randomBytes(32).toString("hex");
}
function hashServerSeed(serverSeed) {
  if (!serverSeed || typeof serverSeed !== "string") {
    throw new Error("Invalid serverSeed: must be a non-empty string");
  }
  return import_crypto2.default.createHash("sha256").update(serverSeed).digest("hex");
}
function calculateSpinResult(serverSeed, clientSeed, nonce, sectors = DEFAULT_SECTORS) {
  if (!serverSeed || typeof serverSeed !== "string") {
    throw new Error("Missing or invalid serverSeed");
  }
  if (clientSeed === void 0 || clientSeed === null) {
    throw new Error("Missing clientSeed");
  }
  const safeClientSeed = String(clientSeed).trim();
  const safeNonce = Number(nonce);
  if (isNaN(safeNonce) || safeNonce < 0) {
    throw new Error("Invalid nonce: must be a non-negative number");
  }
  const activeSectors = Array.isArray(sectors) && sectors.length > 0 ? sectors : DEFAULT_SECTORS;
  const totalWeight = activeSectors.reduce((sum, s) => {
    const w = Number(s.weight);
    return sum + (isNaN(w) || w <= 0 ? 0 : w);
  }, 0);
  if (totalWeight <= 0) {
    throw new Error("Total sectors weight must be greater than zero");
  }
  const hmac = import_crypto2.default.createHmac("sha256", serverSeed);
  hmac.update(`${safeClientSeed}:${safeNonce}`);
  const outcomeHash = hmac.digest("hex");
  const numericValue = parseInt(outcomeHash.substring(0, 8), 16);
  let randomWeight = numericValue % totalWeight;
  let winningSector = activeSectors[0];
  let winningIndex = activeSectors[0].id !== void 0 ? activeSectors[0].id : 0;
  for (let i = 0; i < activeSectors.length; i++) {
    const sector = activeSectors[i];
    const weight = Number(sector.weight) || 0;
    if (randomWeight < weight) {
      winningSector = sector;
      winningIndex = sector.id !== void 0 ? sector.id : i;
      break;
    }
    randomWeight -= weight;
  }
  const serverSeedHash = hashServerSeed(serverSeed);
  return {
    winningIndex,
    winning_index: winningIndex,
    sector: winningSector,
    outcomeHash,
    outcome_hash: outcomeHash,
    serverSeed,
    server_seed: serverSeed,
    serverSeedHash,
    server_seed_hash: serverSeedHash,
    clientSeed: safeClientSeed,
    client_seed: safeClientSeed,
    nonce: safeNonce,
    totalWeight,
    rawNumber: numericValue
  };
}

// server/spinnerService.ts
var import_crypto3 = __toESM(require("crypto"), 1);

// server/db.ts
var import_dotenv = require("dotenv");
var import_promise = __toESM(require("mysql2/promise"), 1);
(0, import_dotenv.config)();
var pool = null;
function getDbPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    console.log("[Database] Connecting to MySQL database... ", connectionString);
    const url = new URL(connectionString);
    pool = import_promise.default.createPool({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 20,
      waitForConnections: true,
      enableKeepAlive: true,
      connectTimeout: 5e3,
      multipleStatements: true
    });
    pool.on("error", (err) => {
      console.error("Unexpected error on idle MySQL client", err);
    });
  }
  return pool;
}
async function query(text, params) {
  const [result] = await getDbPool().query(text, params);
  if (Array.isArray(result)) {
    return { rows: result, rowCount: result.length };
  }
  return { rows: [], rowCount: result.affectedRows };
}
async function getDbConnection() {
  const connection = await getDbPool().getConnection();
  return {
    query: async (text, params) => {
      const [result] = await connection.query(text, params);
      if (Array.isArray(result)) {
        return { rows: result, rowCount: result.length };
      }
      return { rows: [], rowCount: result.affectedRows };
    },
    release: () => connection.release()
  };
}

// server/spinnerService.ts
async function executeSpinnerTransaction(input, inMemoryFallbackUser, inMemoryLogsList) {
  const { telegramId, username, firstName, clientSeed, useFreeTicket, sectors = DEFAULT_SECTORS } = input;
  const SPIN_COST = 10;
  const effectiveClientSeed = clientSeed && typeof clientSeed === "string" && clientSeed.trim() ? clientSeed.trim() : `client_seed_${telegramId}_${Date.now()}`;
  let client = null;
  try {
    getDbPool();
    client = await Promise.race([
      getDbConnection(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DB connection timeout")), 1200))
    ]);
  } catch (dbErr) {
    console.warn(`[Spinner MySQL] Notice: MySQL offline (${dbErr.message}), executing in-memory store transaction.`);
  }
  if (client) {
    try {
      await client.query("START TRANSACTION");
      let userQuery = await client.query(
        "SELECT telegram_id, coins_balance, stars_balance, free_tickets_balance, current_server_seed, current_server_seed_hash, nonce FROM users WHERE telegram_id = ? FOR UPDATE",
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
          [telegramId, username || `player_${telegramId}`, firstName || "Player", initialServerSeed, initialSeedHash]
        );
        userQuery = await client.query(
          "SELECT telegram_id, coins_balance, stars_balance, free_tickets_balance, current_server_seed, current_server_seed_hash, nonce FROM users WHERE telegram_id = ? FOR UPDATE",
          [telegramId]
        );
      }
      const dbUser = userQuery.rows[0];
      let coins = parseFloat(dbUser.coins_balance);
      let stars = parseFloat(dbUser.stars_balance);
      let freeTickets = parseInt(dbUser.free_tickets_balance, 10);
      const currentServerSeed2 = dbUser.current_server_seed;
      const currentServerSeedHash2 = dbUser.current_server_seed_hash || hashServerSeed(currentServerSeed2);
      const currentNonce = parseInt(dbUser.nonce, 10);
      let costAmount2 = SPIN_COST;
      let costCurrency = "COINS";
      if (useFreeTicket && freeTickets > 0) {
        freeTickets -= 1;
        costAmount2 = 1;
        costCurrency = "FREE_TICKET";
      } else {
        if (coins < SPIN_COST) {
          await client.query("ROLLBACK");
          const error = new Error("Insufficient Coins! Use the faucet or win tickets in the scheduled draw.");
          error.status = 400;
          throw error;
        }
        coins -= SPIN_COST;
      }
      const spinResult2 = calculateSpinResult(currentServerSeed2, effectiveClientSeed, currentNonce, sectors);
      const winningSector2 = spinResult2.sector;
      const winningIndex2 = spinResult2.winningIndex;
      if (winningSector2.prize_type === "COINS") {
        coins += winningSector2.prize_value;
      } else if (winningSector2.prize_type === "STARS") {
        stars += winningSector2.prize_value;
      } else if (winningSector2.prize_type === "FREE_TICKET" || winningSector2.prize_type === "FREE_TICKETS") {
        freeTickets += winningSector2.prize_value;
      }
      const nextServerSeed2 = generateServerSeed();
      const nextServerSeedHash2 = hashServerSeed(nextServerSeed2);
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
        [coins, stars, freeTickets, nextServerSeed2, nextServerSeedHash2, telegramId]
      );
      const spinId = import_crypto3.default.randomUUID();
      await client.query(
        `INSERT INTO spinner_logs (
          spin_id, user_id, server_seed, server_seed_hash, client_seed,
          nonce, outcome_hash, winning_index, prize_type, prize_value,
          cost_amount, cost_currency, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          spinId,
          telegramId,
          currentServerSeed2,
          currentServerSeedHash2,
          effectiveClientSeed,
          currentNonce,
          spinResult2.outcomeHash,
          winningIndex2,
          winningSector2.prize_type,
          winningSector2.prize_value,
          costAmount2,
          costCurrency
        ]
      );
      await client.query("COMMIT");
      if (inMemoryFallbackUser) {
        inMemoryFallbackUser.balance_coins = coins;
        inMemoryFallbackUser.balance_stars = stars;
        inMemoryFallbackUser.free_tickets = freeTickets;
        inMemoryFallbackUser.nonce = currentNonce + 1;
        inMemoryFallbackUser.current_server_seed = nextServerSeed2;
      }
      return {
        winning_index: winningIndex2,
        winningIndex: winningIndex2,
        sector: winningSector2,
        animation: {
          duration_ms: 4200,
          total_rotations: 8
        },
        public_seed_hash: currentServerSeedHash2,
        server_seed_hash: currentServerSeedHash2,
        provably_fair: {
          revealed_server_seed: currentServerSeed2,
          server_seed_hash: currentServerSeedHash2,
          client_seed: effectiveClientSeed,
          nonce: currentNonce,
          outcome_hash: spinResult2.outcomeHash,
          next_server_seed_hash: nextServerSeedHash2
        },
        balances: {
          coins,
          stars,
          free_tickets: freeTickets
        }
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  if (!inMemoryFallbackUser) {
    throw new Error("User record not found");
  }
  const user = inMemoryFallbackUser;
  let paidWith = "COINS";
  let costAmount = SPIN_COST;
  if (useFreeTicket && user.free_tickets > 0) {
    user.free_tickets -= 1;
    paidWith = "FREE_TICKET";
    costAmount = 1;
  } else {
    if (user.balance_coins < SPIN_COST) {
      const error = new Error("Insufficient Coins! Use the faucet or win tickets in the scheduled draw.");
      error.status = 400;
      throw error;
    }
    user.balance_coins -= SPIN_COST;
  }
  const currentServerSeed = user.current_server_seed;
  const userNonce = user.nonce;
  const currentServerSeedHash = hashServerSeed(currentServerSeed);
  const spinResult = calculateSpinResult(currentServerSeed, effectiveClientSeed, userNonce, sectors);
  const winningSector = spinResult.sector;
  const winningIndex = spinResult.winningIndex;
  if (winningSector.prize_type === "COINS") {
    user.balance_coins += winningSector.prize_value;
  } else if (winningSector.prize_type === "STARS") {
    user.balance_stars += winningSector.prize_value;
  } else if (winningSector.prize_type === "FREE_TICKET" || winningSector.prize_type === "FREE_TICKETS") {
    user.free_tickets += winningSector.prize_value;
  }
  user.nonce += 1;
  const nextServerSeed = generateServerSeed();
  user.current_server_seed = nextServerSeed;
  const nextServerSeedHash = hashServerSeed(nextServerSeed);
  if (inMemoryLogsList) {
    inMemoryLogsList.unshift({
      spin_id: import_crypto3.default.randomUUID(),
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
      spin_time: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return {
    winning_index: winningIndex,
    winningIndex,
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

// server/adminService.ts
var import_express = __toESM(require("express"), 1);
var import_crypto4 = __toESM(require("crypto"), 1);
var adminUsers = [
  {
    admin_id: "a0000000-0000-0000-0000-000000000001",
    username: "superadmin",
    email: "admin@telegramlottery.io",
    role: "SUPER_ADMIN",
    is_mfa_enabled: true,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    admin_id: "a0000000-0000-0000-0000-000000000002",
    username: "manager",
    email: "manager@telegramlottery.io",
    role: "LOTTERY_MANAGER",
    is_mfa_enabled: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    admin_id: "a0000000-0000-0000-0000-000000000003",
    username: "finance",
    email: "finance@telegramlottery.io",
    role: "FINANCE_OFFICER",
    is_mfa_enabled: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    admin_id: "a0000000-0000-0000-0000-000000000004",
    username: "support",
    email: "support@telegramlottery.io",
    role: "SUPPORT",
    is_mfa_enabled: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var adminAuditLogs = [
  {
    log_id: "log-seed-001",
    admin_id: "a0000000-0000-0000-0000-000000000001",
    admin_username: "superadmin",
    action: "SYSTEM_INITIALIZATION",
    target_resource: "system:core",
    payload: { version: "1.0.0", rtp_baseline: 0.845 },
    ip_address: "127.0.0.1",
    timestamp: new Date(Date.now() - 3600 * 1e3 * 4).toISOString()
  }
];
var withdrawalRequests = [
  {
    request_id: "wdr-101",
    telegram_id: 7770001,
    username: "alice_crypto",
    amount: 25.5,
    currency: "TON",
    destination_wallet: "UQDD8...TON_WALLET_ADDR",
    status: "PENDING",
    created_at: new Date(Date.now() - 1e3 * 60 * 25).toISOString()
  },
  {
    request_id: "wdr-102",
    telegram_id: 7770002,
    username: "bob_lotto",
    amount: 150,
    currency: "STARS",
    destination_wallet: "telegram:bob_lotto",
    status: "APPROVED",
    processed_by: "finance",
    created_at: new Date(Date.now() - 1e3 * 60 * 120).toISOString(),
    processed_at: new Date(Date.now() - 1e3 * 60 * 90).toISOString()
  }
];
async function recordAdminAudit(admin, action, targetResource, payload, ipAddress = "127.0.0.1") {
  const log = {
    log_id: `log-${Date.now()}-${import_crypto4.default.randomBytes(4).toString("hex")}`,
    admin_id: admin.admin_id,
    admin_username: admin.username,
    action,
    target_resource: targetResource,
    payload,
    ip_address: ipAddress,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  adminAuditLogs.unshift(log);
  if (adminAuditLogs.length > 500) {
    adminAuditLogs.pop();
  }
  try {
    await query(
      `INSERT INTO admin_audit_logs (log_id, admin_id, admin_username, action, target_resource, payload, ip_address, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.log_id,
        log.admin_id.startsWith("a0000") ? null : log.admin_id,
        // handle mock vs valid uuid
        log.admin_username,
        log.action,
        log.target_resource,
        JSON.stringify(log.payload),
        log.ip_address,
        log.timestamp
      ]
    );
  } catch (err) {
  }
  return log;
}
function runMonteCarloRtpSimulation(sectors, iterations = 1e6, costPerSpin = 10) {
  const totalWeight = sectors.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight <= 0) {
    throw new Error("Total weight must be greater than zero");
  }
  const cumulative = [];
  let cum = 0;
  for (const s of sectors) {
    cum += s.weight;
    cumulative.push({ sector: s, threshold: cum });
  }
  const hits = {};
  for (const s of sectors) {
    hits[s.id] = { count: 0, prize_type: s.prize_type, label: s.label, prize_value: s.prize_value };
  }
  let totalPayout = 0;
  const totalCost = iterations * costPerSpin;
  for (let i = 0; i < iterations; i++) {
    const roll = Math.random() * totalWeight;
    for (let c = 0; c < cumulative.length; c++) {
      if (roll <= cumulative[c].threshold) {
        const sec = cumulative[c].sector;
        hits[sec.id].count++;
        const val = sec.prize_type === "COINS" ? sec.prize_value : sec.prize_type === "FREE_TICKET" || sec.prize_type === "FREE_TICKETS" ? sec.prize_value * 10 : 0;
        totalPayout += val;
        break;
      }
    }
  }
  const simulatedRtp = totalPayout / totalCost * 100;
  const houseEdge = 100 - simulatedRtp;
  let theoreticalPayout = 0;
  const sectorProbabilities = sectors.map((s) => {
    const prob = s.weight / totalWeight * 100;
    const hitCount = hits[s.id].count;
    const empiricalProb = hitCount / iterations * 100;
    const effectiveValue = s.prize_type === "COINS" ? s.prize_value : s.prize_type.includes("TICKET") ? s.prize_value * 10 : 0;
    theoreticalPayout += s.weight / totalWeight * effectiveValue;
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
  const theoreticalRtp = theoreticalPayout / costPerSpin * 100;
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
function createAdminRouter(serverContext) {
  const router = import_express.default.Router();
  const { users: users2, lotteryDraws: lotteryDraws2, lotteryTickets: lotteryTickets2, SPINNER_SECTORS: SPINNER_SECTORS2, spinLogs: spinLogs2 } = serverContext;
  const getClientIp = (req) => req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "127.0.0.1";
  const requireAdmin = (allowedRoles) => {
    return (req, res, next) => {
      const authHeader = req.headers["authorization"];
      const roleHeader = req.headers["x-admin-role"];
      let currentAdmin = adminUsers[0];
      if (roleHeader) {
        const matched = adminUsers.find((u) => u.role === roleHeader);
        if (matched) currentAdmin = matched;
      } else if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const matched = adminUsers.find((u) => u.username === token || `mock_jwt_${u.username}` === token);
        if (matched) currentAdmin = matched;
      }
      if (!currentAdmin) {
        return res.status(401).json({ success: false, error: "Unauthorized admin access" });
      }
      if (allowedRoles && !allowedRoles.includes(currentAdmin.role)) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: Action requires one of [${allowedRoles.join(", ")}] role. Current: ${currentAdmin.role}`
        });
      }
      req.admin = currentAdmin;
      next();
    };
  };
  router.post("/auth/login", (req, res) => {
    const { username, password, mfa_code } = req.body;
    const admin = adminUsers.find((u) => u.username.toLowerCase() === (username || "").toLowerCase());
    if (!admin) {
      return res.status(401).json({ success: false, error: "Invalid admin credentials" });
    }
    if (admin.is_mfa_enabled && mfa_code && mfa_code !== "123456" && mfa_code.length !== 6) {
      return res.status(401).json({ success: false, error: "Invalid MFA verification code" });
    }
    const token = `adm_token_${admin.username}_${Date.now()}`;
    recordAdminAudit(admin, "ADMIN_LOGIN", `admin:${admin.username}`, { ip: getClientIp(req) }, getClientIp(req));
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
  router.get("/auth/me", requireAdmin(), (req, res) => {
    const admin = req.admin;
    res.json({
      success: true,
      data: admin
    });
  });
  router.get("/metrics", requireAdmin(), (req, res) => {
    let totalTicketRevenue = 0;
    let totalTicketPayouts = 0;
    for (const t of lotteryTickets2) {
      const draw = lotteryDraws2.get(t.draw_id);
      totalTicketRevenue += draw?.ticket_price || 10;
      totalTicketPayouts += t.payout_won || 0;
    }
    let totalSpinRevenue = 0;
    let totalSpinPayouts = 0;
    for (const log of spinLogs2) {
      totalSpinRevenue += 10;
      if (log.prize_type === "COINS") {
        totalSpinPayouts += log.prize_value;
      }
    }
    const totalTurnover = totalTicketRevenue + totalSpinRevenue;
    const totalPayoutsPaid = totalTicketPayouts + totalSpinPayouts;
    const ggr = totalTurnover - totalPayoutsPaid;
    const actualSpinnerRtp = totalSpinRevenue > 0 ? totalSpinPayouts / totalSpinRevenue * 100 : 0;
    const theoreticalRtpSimulation = runMonteCarloRtpSimulation(SPINNER_SECTORS2, 1e4, 10);
    let activeDrawPool = 0;
    let openDrawsCount = 0;
    for (const draw of lotteryDraws2.values()) {
      if (draw.status === "OPEN") {
        activeDrawPool += draw.payout_pool;
        openDrawsCount++;
      }
    }
    const userList = Array.from(users2.values());
    const totalUsers = userList.length;
    const bannedUsers = userList.filter((u) => u.is_banned).length;
    const pendingWithdrawals = withdrawalRequests.filter((w) => w.status === "PENDING").length;
    res.json({
      success: true,
      data: {
        financials: {
          ggr: Number(ggr.toFixed(2)),
          total_turnover: Number(totalTurnover.toFixed(2)),
          total_payouts_paid: Number(totalPayoutsPaid.toFixed(2)),
          profit_margin_pct: totalTurnover > 0 ? Number((ggr / totalTurnover * 100).toFixed(1)) : 0
        },
        users: {
          total_registered: totalUsers,
          dau_estimate: Math.max(totalUsers, 1),
          mau_estimate: Math.max(totalUsers * 3, 5),
          banned_users: bannedUsers
        },
        spinner_analytics: {
          total_spins: spinLogs2.length,
          theoretical_rtp: theoreticalRtpSimulation.theoretical_rtp,
          actual_rtp: `${actualSpinnerRtp.toFixed(1)}%`,
          house_margin: `${(100 - actualSpinnerRtp).toFixed(1)}%`
        },
        lottery_analytics: {
          open_draws: openDrawsCount,
          active_draw_pool: activeDrawPool,
          total_tickets_sold: lotteryTickets2.length
        },
        financial_queue: {
          pending_withdrawals: pendingWithdrawals
        }
      }
    });
  });
  router.get("/draws", requireAdmin(), (req, res) => {
    const draws = Array.from(lotteryDraws2.values()).map((d) => {
      const tickets = lotteryTickets2.filter((t) => t.draw_id === d.draw_id);
      return {
        ...d,
        purchased_tickets: tickets.length
      };
    });
    res.json({ success: true, data: draws });
  });
  router.post("/draws", requireAdmin(["SUPER_ADMIN", "LOTTERY_MANAGER"]), async (req, res) => {
    const admin = req.admin;
    const { title, ticket_price, currency, payout_pool, draw_time_minutes = 60, multi_tier_rules } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: "Draw title is required" });
    }
    const drawId = `draw-${Date.now().toString(36)}`;
    const serverSeed = import_crypto4.default.randomBytes(32).toString("hex");
    const serverSeedHash = hashServerSeed(serverSeed);
    const drawTime = new Date(Date.now() + Number(draw_time_minutes) * 60 * 1e3).toISOString();
    const newDraw = {
      draw_id: drawId,
      title: title.trim(),
      ticket_price: Number(ticket_price) || 10,
      currency: currency === "STARS" ? "STARS" : "COINS",
      payout_pool: Number(payout_pool) || 1e3,
      status: "OPEN",
      draw_time: drawTime,
      winning_numbers: null,
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      ticket_count: 0,
      multi_tier_rules: multi_tier_rules || {
        match_5: 0.7,
        // 70% pool
        match_4: 0.2,
        // 20% pool
        match_3: 0.08,
        // 8% pool
        match_2: 1.5
        // 1.5x ticket cost
      }
    };
    lotteryDraws2.set(drawId, newDraw);
    await recordAdminAudit(
      admin,
      "CREATE_LOTTERY_DRAW",
      `draws:${drawId}`,
      { title: newDraw.title, ticket_price: newDraw.ticket_price, pool: newDraw.payout_pool },
      getClientIp(req)
    );
    res.json({
      success: true,
      message: "Lottery draw scheduled and opened successfully",
      data: newDraw
    });
  });
  router.put("/draws/:draw_id/status", requireAdmin(["SUPER_ADMIN", "LOTTERY_MANAGER"]), async (req, res) => {
    const admin = req.admin;
    const { draw_id } = req.params;
    const { status } = req.body;
    const draw = lotteryDraws2.get(draw_id);
    if (!draw) {
      return res.status(404).json({ success: false, error: "Draw not found" });
    }
    if (!["OPEN", "LOCKED"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status transition. Use execute or cancel endpoint for completion." });
    }
    const prevStatus = draw.status;
    draw.status = status;
    await recordAdminAudit(
      admin,
      "UPDATE_DRAW_STATUS",
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
  router.post("/draws/:draw_id/execute", requireAdmin(["SUPER_ADMIN", "LOTTERY_MANAGER"]), async (req, res) => {
    const admin = req.admin;
    const { draw_id } = req.params;
    const draw = lotteryDraws2.get(draw_id);
    if (!draw) {
      return res.status(404).json({ success: false, error: "Draw not found" });
    }
    if (draw.status === "COMPLETED") {
      return res.status(400).json({ success: false, error: "Draw is already completed" });
    }
    const winningNumbers = [];
    let round = 0;
    while (winningNumbers.length < 5) {
      const hash = import_crypto4.default.createHmac("sha256", draw.server_seed).update(`draw_round_${round}`).digest("hex");
      const num = parseInt(hash.substring(0, 8), 16) % 35 + 1;
      if (!winningNumbers.includes(num)) {
        winningNumbers.push(num);
      }
      round++;
    }
    winningNumbers.sort((a, b) => a - b);
    draw.status = "COMPLETED";
    draw.winning_numbers = winningNumbers;
    const ticketsForDraw = lotteryTickets2.filter((t) => t.draw_id === draw_id);
    let winnersCount = 0;
    let totalDistributed = 0;
    for (const t of ticketsForDraw) {
      const matches = t.selected_numbers.filter((n) => winningNumbers.includes(n)).length;
      t.matches = matches;
      let reward = 0;
      if (matches === 5) {
        reward = Math.round(draw.payout_pool * 0.7);
      } else if (matches === 4) {
        reward = Math.round(draw.payout_pool * 0.2);
      } else if (matches === 3) {
        reward = Math.round(draw.payout_pool * 0.08);
      } else if (matches >= 2) {
        reward = draw.ticket_price * 1.5;
      }
      t.payout_won = reward;
      if (reward > 0) {
        winnersCount++;
        totalDistributed += reward;
        const player = users2.get(t.telegram_id);
        if (player) {
          if (draw.currency === "COINS") {
            player.balance_coins += reward;
          } else {
            player.balance_stars += reward;
          }
        }
      }
    }
    await recordAdminAudit(
      admin,
      "FORCE_DRAW_EXECUTION",
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
        status: "COMPLETED",
        winning_numbers: winningNumbers,
        revealed_server_seed: draw.server_seed,
        server_seed_hash: draw.server_seed_hash,
        total_payout: totalDistributed,
        winning_tickets_count: winnersCount,
        tickets_evaluated: ticketsForDraw.length
      }
    });
  });
  router.post("/draws/:draw_id/cancel", requireAdmin(["SUPER_ADMIN"]), async (req, res) => {
    const admin = req.admin;
    const { draw_id } = req.params;
    const { memo = "Draw cancelled by administrator" } = req.body;
    const draw = lotteryDraws2.get(draw_id);
    if (!draw) {
      return res.status(404).json({ success: false, error: "Draw not found" });
    }
    if (draw.status === "COMPLETED") {
      return res.status(400).json({ success: false, error: "Completed draws cannot be refunded" });
    }
    const ticketsForDraw = lotteryTickets2.filter((t) => t.draw_id === draw_id);
    let refundedCount = 0;
    let refundedAmount = 0;
    for (const t of ticketsForDraw) {
      const player = users2.get(t.telegram_id);
      if (player) {
        if (draw.currency === "COINS") {
          player.balance_coins += draw.ticket_price;
        } else {
          player.balance_stars += draw.ticket_price;
        }
        refundedCount++;
        refundedAmount += draw.ticket_price;
      }
      t.status = "REFUNDED";
    }
    draw.status = "CANCELLED";
    await recordAdminAudit(
      admin,
      "CANCEL_AND_REFUND_DRAW",
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
  router.get("/spinner/sectors", requireAdmin(), (req, res) => {
    const simulation = runMonteCarloRtpSimulation(SPINNER_SECTORS2, 1e4, 10);
    res.json({
      success: true,
      data: {
        sectors: SPINNER_SECTORS2,
        simulation
      }
    });
  });
  router.put("/spinner/sectors", requireAdmin(["SUPER_ADMIN", "LOTTERY_MANAGER"]), async (req, res) => {
    const admin = req.admin;
    const { sectors } = req.body;
    if (!Array.isArray(sectors) || sectors.length === 0) {
      return res.status(400).json({ success: false, error: "Sectors array is required" });
    }
    for (const s of sectors) {
      if (typeof s.weight !== "number" || s.weight < 1) {
        return res.status(400).json({ success: false, error: `Invalid weight for sector ${s.label || s.id}` });
      }
      if (!["NO_WIN", "COINS", "FREE_TICKET", "STARS"].includes(s.prize_type)) {
        return res.status(400).json({ success: false, error: `Invalid prize type ${s.prize_type}` });
      }
    }
    SPINNER_SECTORS2.length = 0;
    sectors.forEach((s, idx) => {
      SPINNER_SECTORS2.push({
        id: typeof s.id === "number" ? s.id : typeof s.sector_id === "number" ? s.sector_id : idx,
        label: s.label || `Sector ${idx}`,
        weight: Math.round(s.weight),
        prize_type: s.prize_type,
        prize_value: Number(s.prize_value) || 0,
        color: s.color || "#0284C7"
      });
    });
    const simulation = runMonteCarloRtpSimulation(SPINNER_SECTORS2, 1e5, 10);
    await recordAdminAudit(
      admin,
      "UPDATE_SPINNER_WEIGHTS",
      "spinner:sectors",
      { sectors_count: SPINNER_SECTORS2.length, simulated_rtp: simulation.simulated_rtp },
      getClientIp(req)
    );
    res.json({
      success: true,
      message: "Spinner configuration updated and cached successfully.",
      calculated_rtp: simulation.theoretical_rtp,
      data: {
        sectors: SPINNER_SECTORS2,
        simulation
      }
    });
  });
  router.post("/spinner/simulate-rtp", requireAdmin(), (req, res) => {
    const { sectors, iterations = 1e5, cost_per_spin = 10 } = req.body;
    const targetSectors = Array.isArray(sectors) && sectors.length > 0 ? sectors : SPINNER_SECTORS2;
    try {
      const simulation = runMonteCarloRtpSimulation(
        targetSectors,
        Math.min(Math.max(Number(iterations) || 1e4, 1e3), 1e6),
        Number(cost_per_spin) || 10
      );
      res.json({
        success: true,
        data: simulation
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
  router.get("/users", requireAdmin(), (req, res) => {
    const queryStr = (req.query.search || "").toLowerCase().trim();
    const userList = Array.from(users2.values());
    const filtered = userList.filter((u) => {
      if (!queryStr) return true;
      return u.telegram_id.toString().includes(queryStr) || u.username && u.username.toLowerCase().includes(queryStr) || u.first_name && u.first_name.toLowerCase().includes(queryStr);
    });
    const enriched = filtered.map((u) => {
      const tickets = lotteryTickets2.filter((t) => t.telegram_id === u.telegram_id);
      const spins = spinLogs2.filter((s) => s.telegram_id === u.telegram_id);
      let totalSpent = tickets.length * 10 + spins.length * 10;
      let totalWon = 0;
      for (const t of tickets) totalWon += t.payout_won || 0;
      for (const s of spins) {
        if (s.prize_type === "COINS") totalWon += s.prize_value;
      }
      return {
        telegram_id: u.telegram_id,
        username: u.username,
        first_name: u.first_name,
        balance_coins: u.balance_coins,
        balance_stars: u.balance_stars,
        free_tickets: u.free_tickets,
        nonce: u.nonce,
        is_banned: Boolean(u.is_banned),
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
  router.get("/users/:telegram_id", requireAdmin(), (req, res) => {
    const userId = Number(req.params.telegram_id);
    const user = users2.get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const tickets = lotteryTickets2.filter((t) => t.telegram_id === userId);
    const spins = spinLogs2.filter((s) => s.telegram_id === userId).slice(0, 30);
    res.json({
      success: true,
      data: {
        user,
        tickets,
        recent_spins: spins
      }
    });
  });
  router.post("/users/:telegram_id/adjust-balance", requireAdmin(["SUPER_ADMIN", "FINANCE_OFFICER"]), async (req, res) => {
    const admin = req.admin;
    const userId = Number(req.params.telegram_id);
    const { currency, amount, operation, memo } = req.body;
    if (!memo || memo.trim().length < 4) {
      return res.status(400).json({ success: false, error: "A mandatory internal memo is required for balance adjustments" });
    }
    const user = users2.get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const numericAmount = Math.abs(Number(amount));
    if (isNaN(numericAmount) || numericAmount === 0) {
      return res.status(400).json({ success: false, error: "Valid adjustment amount required" });
    }
    const factor = operation === "DEDUCT" ? -1 : 1;
    const delta = numericAmount * factor;
    if (currency === "COINS") {
      if (factor === -1 && user.balance_coins < numericAmount) {
        return res.status(400).json({ success: false, error: "Deduction exceeds user coins balance" });
      }
      user.balance_coins += delta;
    } else if (currency === "STARS") {
      if (factor === -1 && user.balance_stars < numericAmount) {
        return res.status(400).json({ success: false, error: "Deduction exceeds user stars balance" });
      }
      user.balance_stars += delta;
    } else if (currency === "FREE_TICKETS") {
      if (factor === -1 && user.free_tickets < numericAmount) {
        return res.status(400).json({ success: false, error: "Deduction exceeds user tickets balance" });
      }
      user.free_tickets += delta;
    } else {
      return res.status(400).json({ success: false, error: "Invalid currency" });
    }
    await recordAdminAudit(
      admin,
      "MANUAL_BALANCE_ADJUSTMENT",
      `users:${userId}`,
      { currency, delta, memo, current_balances: { coins: user.balance_coins, stars: user.balance_stars, tickets: user.free_tickets } },
      getClientIp(req)
    );
    res.json({
      success: true,
      message: `Adjusted user #${userId} balance by ${delta > 0 ? "+" : ""}${delta} ${currency}`,
      data: {
        telegram_id: user.telegram_id,
        balance_coins: user.balance_coins,
        balance_stars: user.balance_stars,
        free_tickets: user.free_tickets
      }
    });
  });
  router.post("/users/:telegram_id/toggle-ban", requireAdmin(["SUPER_ADMIN", "SUPPORT"]), async (req, res) => {
    const admin = req.admin;
    const userId = Number(req.params.telegram_id);
    const { memo = "Status updated by admin" } = req.body;
    const user = users2.get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const currentBan = Boolean(user.is_banned);
    user.is_banned = !currentBan;
    await recordAdminAudit(
      admin,
      user.is_banned ? "BAN_USER" : "UNBAN_USER",
      `users:${userId}`,
      { memo, new_status: user.is_banned ? "BANNED" : "ACTIVE" },
      getClientIp(req)
    );
    res.json({
      success: true,
      message: `User #${userId} is now ${user.is_banned ? "BANNED" : "ACTIVE"}`,
      is_banned: user.is_banned
    });
  });
  router.get("/withdrawals", requireAdmin(), (req, res) => {
    res.json({ success: true, data: withdrawalRequests });
  });
  router.post("/withdrawals/:request_id/action", requireAdmin(["SUPER_ADMIN", "FINANCE_OFFICER"]), async (req, res) => {
    const admin = req.admin;
    const { request_id } = req.params;
    const { action, notes } = req.body;
    const item = withdrawalRequests.find((w) => w.request_id === request_id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Withdrawal request not found" });
    }
    if (!["APPROVED", "REJECTED", "PROCESSED"].includes(action)) {
      return res.status(400).json({ success: false, error: "Invalid action" });
    }
    item.status = action;
    item.processed_by = admin.username;
    item.processed_at = (/* @__PURE__ */ new Date()).toISOString();
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
  router.post("/audit/verify-seed", requireAdmin(), (req, res) => {
    const { server_seed, client_seed, nonce, type = "SPINNER" } = req.body;
    if (!server_seed || !client_seed) {
      return res.status(400).json({ success: false, error: "Server seed and client seed are required" });
    }
    try {
      if (type === "SPINNER") {
        const result = calculateSpinResult(server_seed, client_seed, Number(nonce) || 0, SPINNER_SECTORS2);
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
        const winningNumbers = [];
        let round = 0;
        while (winningNumbers.length < 5) {
          const hash = import_crypto4.default.createHmac("sha256", server_seed).update(`draw_round_${round}`).digest("hex");
          const num = parseInt(hash.substring(0, 8), 16) % 35 + 1;
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
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
  router.get("/audit/anomalies", requireAdmin(), (req, res) => {
    const anomalies = [];
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1e3;
    const userSpinMap = /* @__PURE__ */ new Map();
    for (const log of spinLogs2) {
      const logTime = new Date(log.spin_time).getTime();
      if (logTime >= tenMinutesAgo) {
        if (!userSpinMap.has(log.telegram_id)) userSpinMap.set(log.telegram_id, []);
        userSpinMap.get(log.telegram_id).push(log);
      }
    }
    userSpinMap.forEach((logs, uId) => {
      const jackpots = logs.filter((l) => l.prize_value >= 500);
      const wins = logs.filter((l) => l.prize_type !== "NO_WIN");
      if (jackpots.length >= 3) {
        anomalies.push({
          id: `anom-${uId}-jp`,
          telegram_id: uId,
          username: users2.get(uId)?.username || "Unknown",
          severity: "HIGH",
          reason: "Excessive Jackpot Velocity Detected",
          details: `${jackpots.length} Jackpots hit within the last 10 minutes (${logs.length} total spins).`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else if (logs.length > 50) {
        anomalies.push({
          id: `anom-${uId}-freq`,
          telegram_id: uId,
          username: users2.get(uId)?.username || "Unknown",
          severity: "MEDIUM",
          reason: "High Frequency Bot Spin Pattern",
          details: `${logs.length} spins executed in under 10 minutes.`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    });
    res.json({ success: true, data: anomalies });
  });
  router.get("/audit/logs", requireAdmin(), (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    res.json({
      success: true,
      data: adminAuditLogs.slice(0, limit)
    });
  });
  return router;
}

// server/referralService.ts
var import_crypto5 = __toESM(require("crypto"), 1);
var import_express2 = __toESM(require("express"), 1);
var SIGNUP_BONUS_COINS = 50;
var DEPOSIT_COMMISSION_RATE = 0.1;
var PRIZE_COMMISSION_RATE = 0.1;
var inMemoryReferrals = /* @__PURE__ */ new Map();
var inMemoryRewards = [];
function seedInitialReferral() {
  const refereeId = 7770002;
  const referrerId = 7770001;
  const now = new Date(Date.now() - 3600 * 1e3 * 4).toISOString();
  inMemoryReferrals.set(refereeId, {
    id: "ref-seed-001",
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_username: "player_7770002",
    referee_first_name: "Player #0002",
    signup_bonus_coins: SIGNUP_BONUS_COINS,
    total_commission_coins: 60,
    created_at: now
  });
  inMemoryRewards.push(
    {
      reward_id: "rw-seed-01",
      referrer_id: referrerId,
      referee_id: refereeId,
      referee_name: "Player #0002",
      reward_type: "SIGNUP_BONUS",
      source_event: "FRIEND_SIGNUP",
      original_amount: SIGNUP_BONUS_COINS,
      commission_rate: 1,
      reward_coins: SIGNUP_BONUS_COINS,
      description: "Friend joined via your Telegram invite link",
      created_at: now
    },
    {
      reward_id: "rw-seed-02",
      referrer_id: referrerId,
      referee_id: refereeId,
      referee_name: "Player #0002",
      reward_type: "DEPOSIT_COMMISSION",
      source_event: "COIN_DEPOSIT",
      original_amount: 100,
      commission_rate: DEPOSIT_COMMISSION_RATE,
      reward_coins: 10,
      description: "10% Commission on friend deposit of 100 Coins",
      created_at: new Date(Date.now() - 3600 * 1e3 * 2).toISOString()
    }
  );
}
seedInitialReferral();
async function registerReferral(referrerId, refereeId, users2) {
  if (referrerId === refereeId) {
    return { success: false, bonus: 0, error: "Cannot refer your own Telegram account." };
  }
  const referee = users2.get(refereeId);
  if (!referee) {
    return { success: false, bonus: 0, error: "Referee account not found." };
  }
  if (referee.referred_by) {
    return { success: false, bonus: 0, error: "User is already linked to a referrer." };
  }
  const referrer = users2.get(referrerId);
  if (!referrer) {
    return { success: false, bonus: 0, error: "Referrer does not exist." };
  }
  referee.referred_by = referrerId;
  referrer.balance_coins = (referrer.balance_coins || 0) + SIGNUP_BONUS_COINS;
  referee.balance_coins = (referee.balance_coins || 0) + SIGNUP_BONUS_COINS;
  referee.free_tickets = (referee.free_tickets || 0) + 1;
  const referralRecord = {
    id: import_crypto5.default.randomUUID(),
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_username: referee.username || `player_${refereeId}`,
    referee_first_name: referee.first_name || `Player #${refereeId.toString().slice(-4)}`,
    signup_bonus_coins: SIGNUP_BONUS_COINS,
    total_commission_coins: 0,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  inMemoryReferrals.set(refereeId, referralRecord);
  const reward = {
    reward_id: import_crypto5.default.randomUUID(),
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_name: referee.first_name || referee.username || `Player #${refereeId}`,
    reward_type: "SIGNUP_BONUS",
    source_event: "FRIEND_SIGNUP",
    original_amount: SIGNUP_BONUS_COINS,
    commission_rate: 1,
    reward_coins: SIGNUP_BONUS_COINS,
    description: `Invite bonus: ${referee.first_name || referee.username} joined via your link!`,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  inMemoryRewards.unshift(reward);
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
        reward.description
      ]
    );
  } catch (dbErr) {
  }
  return { success: true, bonus: SIGNUP_BONUS_COINS };
}
async function processDepositCommission(refereeId, depositCoins, users2) {
  if (depositCoins <= 0) return null;
  const referee = users2.get(refereeId);
  const referrerId = referee?.referred_by || inMemoryReferrals.get(refereeId)?.referrer_id;
  if (!referrerId) return null;
  const referrer = users2.get(referrerId);
  if (!referrer) return null;
  const commission = Math.round(depositCoins * DEPOSIT_COMMISSION_RATE * 100) / 100;
  if (commission <= 0) return null;
  referrer.balance_coins = (referrer.balance_coins || 0) + commission;
  const record = inMemoryReferrals.get(refereeId);
  if (record) {
    record.total_commission_coins = (record.total_commission_coins || 0) + commission;
  }
  const refereeName = referee?.first_name || referee?.username || `Player #${refereeId.toString().slice(-4)}`;
  const reward = {
    reward_id: import_crypto5.default.randomUUID(),
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_name: refereeName,
    reward_type: "DEPOSIT_COMMISSION",
    source_event: "COIN_DEPOSIT",
    original_amount: depositCoins,
    commission_rate: DEPOSIT_COMMISSION_RATE,
    reward_coins: commission,
    description: `10% Deposit Commission (+${commission} Coins) from ${refereeName}'s deposit of ${depositCoins} Coins`,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  inMemoryRewards.unshift(reward);
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
        reward.description
      ]
    );
  } catch (dbErr) {
  }
  return reward;
}
async function processPrizeCommission(refereeId, prizeCoins, sourceEvent, users2) {
  if (prizeCoins <= 0) return null;
  const referee = users2.get(refereeId);
  const referrerId = referee?.referred_by || inMemoryReferrals.get(refereeId)?.referrer_id;
  if (!referrerId) return null;
  const referrer = users2.get(referrerId);
  if (!referrer) return null;
  const commission = Math.round(prizeCoins * PRIZE_COMMISSION_RATE * 100) / 100;
  if (commission <= 0) return null;
  referrer.balance_coins = (referrer.balance_coins || 0) + commission;
  const record = inMemoryReferrals.get(refereeId);
  if (record) {
    record.total_commission_coins = (record.total_commission_coins || 0) + commission;
  }
  const refereeName = referee?.first_name || referee?.username || `Player #${refereeId.toString().slice(-4)}`;
  const reward = {
    reward_id: import_crypto5.default.randomUUID(),
    referrer_id: referrerId,
    referee_id: refereeId,
    referee_name: refereeName,
    reward_type: "PRIZE_COMMISSION",
    source_event: sourceEvent,
    original_amount: prizeCoins,
    commission_rate: PRIZE_COMMISSION_RATE,
    reward_coins: commission,
    description: `10% Win Commission (+${commission} Coins) from ${refereeName}'s prize win of ${prizeCoins} Coins in ${sourceEvent}`,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  inMemoryRewards.unshift(reward);
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
        reward.description
      ]
    );
  } catch (dbErr) {
  }
  return reward;
}
function getReferralStats(telegramId, users2, req) {
  const user = users2.get(telegramId);
  const botUsername = process.env.BOT_USERNAME || "LuckyFortuneLottoBot";
  const inviteLink = `https://t.me/${botUsername}?startapp=ref_${telegramId}`;
  const shareText = `\xF0\u0178\u017D\xB0 Spin the Fortune Wheel & Win Real Crypto with me! Get 50 Free Bonus Coins & 1 Free Lottery Ticket when you sign up with my invite link! \xF0\u0178\u017D\x81`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;
  const friendsList = [];
  inMemoryReferrals.forEach((record) => {
    if (record.referrer_id === telegramId) {
      friendsList.push({
        telegram_id: record.referee_id,
        username: record.referee_username,
        first_name: record.referee_first_name,
        joined_at: record.created_at,
        total_commission_generated: record.total_commission_coins + record.signup_bonus_coins,
        status: "ACTIVE"
      });
    }
  });
  const userRewards = inMemoryRewards.filter((r) => r.referrer_id === telegramId);
  let signupTotal = 0;
  let depositTotal = 0;
  let prizeTotal = 0;
  userRewards.forEach((r) => {
    if (r.reward_type === "SIGNUP_BONUS") signupTotal += r.reward_coins;
    else if (r.reward_type === "DEPOSIT_COMMISSION") depositTotal += r.reward_coins;
    else if (r.reward_type === "PRIZE_COMMISSION") prizeTotal += r.reward_coins;
  });
  let referrerInfo = null;
  if (user?.referred_by) {
    const parent = users2.get(user.referred_by);
    referrerInfo = {
      telegram_id: user.referred_by,
      username: parent?.username || `player_${user.referred_by}`,
      first_name: parent?.first_name || "Your Referrer"
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
      prize_commissions: Math.round(prizeTotal * 100) / 100
    },
    referred_by: referrerInfo,
    friends: friendsList,
    recent_rewards: userRewards.slice(0, 20)
  };
}
function createReferralRouter(users2) {
  const router = import_express2.default.Router();
  const getUser = (req) => {
    const customId = req.headers["x-telegram-user-id"];
    let id = 7770001;
    if (customId && !isNaN(Number(customId))) {
      id = Number(customId);
    }
    let user = users2.get(id);
    if (!user) {
      user = {
        telegram_id: id,
        username: `player_${id}`,
        first_name: `Player #${id.toString().slice(-4)}`,
        balance_coins: 200,
        balance_stars: 20,
        free_tickets: 3,
        nonce: 0,
        current_server_seed: import_crypto5.default.randomBytes(32).toString("hex"),
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        referred_by: null
      };
      users2.set(id, user);
    }
    return user;
  };
  router.get("/stats", (req, res) => {
    const user = getUser(req);
    if (!user) {
      return res.status(404).json({ success: false, error: "User profile not found" });
    }
    const stats = getReferralStats(user.telegram_id, users2, req);
    res.json({ success: true, data: stats });
  });
  router.post("/apply", async (req, res) => {
    const user = getUser(req);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const { referral_code } = req.body;
    if (!referral_code || typeof referral_code !== "string") {
      return res.status(400).json({ success: false, error: "Please enter a valid referral code or link." });
    }
    const cleaned = referral_code.trim().replace(/^ref_/, "");
    const referrerId = Number(cleaned);
    if (isNaN(referrerId) || referrerId <= 0) {
      return res.status(400).json({ success: false, error: "Invalid referral code format." });
    }
    if (!users2.has(referrerId)) {
      users2.set(referrerId, {
        telegram_id: referrerId,
        username: `player_${referrerId}`,
        first_name: `Player #${referrerId.toString().slice(-4)}`,
        balance_coins: 200,
        balance_stars: 20,
        free_tickets: 3,
        nonce: 0,
        current_server_seed: import_crypto5.default.randomBytes(32).toString("hex"),
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    const result = await registerReferral(referrerId, user.telegram_id, users2);
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
        free_tickets: user.free_tickets
      }
    });
  });
  router.post("/simulate", async (req, res) => {
    const user = getUser(req);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const { action } = req.body;
    const referrerId = user.telegram_id;
    if (action === "JOIN") {
      const mockFriendId = Math.floor(1e6 + Math.random() * 9e6);
      const mockUsername = `friend_${Math.floor(100 + Math.random() * 900)}`;
      const mockFirstName = `Alex ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`;
      users2.set(mockFriendId, {
        telegram_id: mockFriendId,
        username: mockUsername,
        first_name: mockFirstName,
        balance_coins: 250,
        balance_stars: 20,
        free_tickets: 4,
        nonce: 0,
        current_server_seed: import_crypto5.default.randomBytes(32).toString("hex"),
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        referred_by: referrerId
      });
      const reg = await registerReferral(referrerId, mockFriendId, users2);
      const stats = getReferralStats(referrerId, users2, req);
      return res.json({
        success: true,
        message: `\xF0\u0178\u017D\u2030 Simulated Friend "${mockFirstName}" joined using your Telegram invite link! You earned +${SIGNUP_BONUS_COINS} Coins!`,
        action_type: "JOIN",
        earned_coins: SIGNUP_BONUS_COINS,
        balances: {
          coins: user.balance_coins,
          stars: user.balance_stars,
          free_tickets: user.free_tickets
        },
        stats
      });
    }
    let friendId = null;
    let friendName = "Referred Friend";
    inMemoryReferrals.forEach((rec) => {
      if (rec.referrer_id === referrerId && !friendId) {
        friendId = rec.referee_id;
        friendName = rec.referee_first_name;
      }
    });
    if (!friendId) {
      friendId = Math.floor(1e6 + Math.random() * 9e6);
      friendName = `Jordan T.`;
      users2.set(friendId, {
        telegram_id: friendId,
        username: `friend_${friendId.toString().slice(-4)}`,
        first_name: friendName,
        balance_coins: 500,
        balance_stars: 50,
        free_tickets: 5,
        nonce: 0,
        current_server_seed: import_crypto5.default.randomBytes(32).toString("hex"),
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        referred_by: referrerId
      });
      await registerReferral(referrerId, friendId, users2);
    }
    if (action === "DEPOSIT") {
      const depositAmount = 100;
      const reward = await processDepositCommission(friendId, depositAmount, users2);
      const stats = getReferralStats(referrerId, users2, req);
      return res.json({
        success: true,
        message: `\xF0\u0178\u2019\xB3 Simulated Friend "${friendName}" deposited ${depositAmount} Coins! You earned a 10% commission (+${reward?.reward_coins} Coins)!`,
        action_type: "DEPOSIT",
        earned_coins: reward?.reward_coins || 10,
        balances: {
          coins: user.balance_coins,
          stars: user.balance_stars,
          free_tickets: user.free_tickets
        },
        stats
      });
    }
    if (action === "WIN") {
      const prizeAmount = 500;
      const reward = await processPrizeCommission(friendId, prizeAmount, "WHEEL_JACKPOT_SPIN", users2);
      const stats = getReferralStats(referrerId, users2, req);
      return res.json({
        success: true,
        message: `\xF0\u0178\x8F\u2020 Simulated Friend "${friendName}" hit a 500 Coin Jackpot win! You earned a 10% prize commission (+${reward?.reward_coins} Coins)!`,
        action_type: "WIN",
        earned_coins: reward?.reward_coins || 50,
        balances: {
          coins: user.balance_coins,
          stars: user.balance_stars,
          free_tickets: user.free_tickets
        },
        stats
      });
    }
    return res.status(400).json({ success: false, error: "Unknown simulation action." });
  });
  return router;
}

// server.ts
var app = (0, import_express3.default)();
var PORT = 3e3;
app.use(import_express3.default.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-telegram-user-id, x-admin-role, x-referral-code");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
var users = /* @__PURE__ */ new Map();
var spinLogs = [];
var lotteryDraws = /* @__PURE__ */ new Map();
var lotteryTickets = [];
var SPINNER_SECTORS = [
  { id: 0, label: "Try Again", weight: 400, prize_type: "NO_WIN", prize_value: 0, color: "#1E293B" },
  { id: 1, label: "10 Coins", weight: 300, prize_type: "COINS", prize_value: 10, color: "#0EA5E9" },
  { id: 2, label: "1 Free Ticket", weight: 200, prize_type: "FREE_TICKET", prize_value: 1, color: "#10B981" },
  { id: 3, label: "50 Coins", weight: 90, prize_type: "COINS", prize_value: 50, color: "#F59E0B" },
  { id: 4, label: "JACKPOT (500)", weight: 10, prize_type: "COINS", prize_value: 500, color: "#EF4444" }
];
function initializeLotteryDraws() {
  const now = Date.now();
  const initialDraws = [
    {
      id: "draw-hourly-1",
      title: "\u26A1 Lightning Hourly Jackpot",
      ticket_price: 15,
      currency: "COINS",
      payout_pool: 1250,
      draw_time: new Date(now + 15 * 60 * 1e3).toISOString()
      // 15 mins from now
    },
    {
      id: "draw-daily-1",
      title: "\u{1F31F} Daily Grand Super-Lotto",
      ticket_price: 50,
      currency: "COINS",
      payout_pool: 8500,
      draw_time: new Date(now + 6 * 3600 * 1e3).toISOString()
      // 6 hrs from now
    },
    {
      id: "draw-stars-1",
      title: "\u2B50 Telegram Stars Mega Bonanza",
      ticket_price: 5,
      currency: "STARS",
      payout_pool: 350,
      draw_time: new Date(now + 24 * 3600 * 1e3).toISOString()
      // 24 hrs from now
    }
  ];
  for (const d of initialDraws) {
    const seed = import_crypto6.default.randomBytes(32).toString("hex");
    lotteryDraws.set(d.id, {
      draw_id: d.id,
      title: d.title,
      ticket_price: d.ticket_price,
      currency: d.currency,
      payout_pool: d.payout_pool,
      status: "OPEN",
      draw_time: d.draw_time,
      winning_numbers: null,
      server_seed: seed,
      server_seed_hash: import_crypto6.default.createHash("sha256").update(seed).digest("hex"),
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      ticket_count: 0
    });
  }
}
initializeLotteryDraws();
function resolveTelegramUser(req) {
  const authHeader = req.headers["authorization"]?.replace("Bearer ", "").replace("tma ", "") || "";
  const customId = req.headers["x-telegram-user-id"];
  let telegramId = 7770001;
  let username = "lotto_player";
  let firstName = "Player One";
  if (req.telegramUser) {
    telegramId = req.telegramUser.id;
    if (req.telegramUser.username) username = req.telegramUser.username;
    if (req.telegramUser.first_name) firstName = req.telegramUser.first_name;
  } else if (customId && !isNaN(Number(customId))) {
    telegramId = Number(customId);
    username = `player_${telegramId}`;
    firstName = `Player #${telegramId.toString().slice(-4)}`;
  } else if (authHeader && authHeader.includes("user=")) {
    try {
      const params = new URLSearchParams(authHeader);
      const userRaw = params.get("user");
      if (userRaw) {
        const parsed = JSON.parse(decodeURIComponent(userRaw));
        if (parsed.id) telegramId = parsed.id;
        if (parsed.username) username = parsed.username;
        if (parsed.first_name) firstName = parsed.first_name;
      }
    } catch {
    }
  }
  let user = users.get(telegramId);
  let refParam = req.query?.ref || req.headers["x-referral-code"] || req.body?.referrer_id || req.body?.start_param || "";
  if (!refParam && authHeader && authHeader.includes("start_param=")) {
    try {
      const params = new URLSearchParams(authHeader);
      refParam = params.get("start_param") || "";
    } catch {
    }
  }
  let potentialReferrerId = null;
  if (refParam) {
    const cleaned = refParam.toString().replace(/^ref_/, "");
    const num = Number(cleaned);
    if (!isNaN(num) && num > 0 && num !== telegramId) {
      potentialReferrerId = num;
    }
  }
  if (!user) {
    const serverSeed = import_crypto6.default.randomBytes(32).toString("hex");
    user = {
      telegram_id: telegramId,
      username,
      first_name: firstName,
      balance_coins: 200,
      balance_stars: 20,
      free_tickets: 3,
      nonce: 0,
      current_server_seed: serverSeed,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      referred_by: potentialReferrerId || null
    };
    users.set(telegramId, user);
    if (potentialReferrerId) {
      registerReferral(potentialReferrerId, telegramId, users).catch(() => {
      });
    }
  } else if (!user.referred_by && potentialReferrerId) {
    registerReferral(potentialReferrerId, telegramId, users).catch(() => {
    });
  }
  return user;
}
app.use("/api/v1/admin", createAdminRouter({
  users,
  lotteryDraws,
  lotteryTickets,
  SPINNER_SECTORS,
  spinLogs
}));
app.use("/api/v1/referral", createReferralRouter(users));
app.post("/api/v1/auth/telegram", (req, res) => {
  const initData = req.headers["authorization"]?.replace("Bearer ", "").replace("tma ", "") || req.body?.initData || "";
  const botToken = process.env.BOT_TOKEN;
  if (botToken && initData) {
    const result = validateTelegramInitData(initData, botToken);
    if (!result.valid) {
      return res.status(401).json({ success: false, error: `Unauthorized: ${result.error || "Invalid signature"}` });
    }
    if (result.data?.user) {
      req.telegramUser = result.data.user;
    }
  }
  const user = resolveTelegramUser(req);
  const nextSeedHash = import_crypto6.default.createHash("sha256").update(user.current_server_seed).digest("hex");
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
app.post("/api/v1/faucet", async (req, res) => {
  const user = resolveTelegramUser(req);
  user.balance_coins += 100;
  user.balance_stars += 10;
  user.free_tickets += 2;
  await processDepositCommission(user.telegram_id, 100, users);
  res.json({
    success: true,
    message: "Added 100 Coins, 10 Stars, and 2 Free Tickets!",
    balances: {
      coins: user.balance_coins,
      stars: user.balance_stars,
      free_tickets: user.free_tickets
    }
  });
});
app.post("/api/v1/deposit", async (req, res) => {
  const user = resolveTelegramUser(req);
  if (user.is_banned) {
    return res.status(403).json({ success: false, error: "Account suspended." });
  }
  const amount = Number(req.body.amount) || 100;
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: "Invalid deposit amount" });
  }
  user.balance_coins += amount;
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
app.get("/api/v1/spinner/config", (req, res) => {
  const user = resolveTelegramUser(req);
  const serverSeedHash = import_crypto6.default.createHash("sha256").update(user.current_server_seed).digest("hex");
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
app.post("/api/v1/spinner/spin", async (req, res) => {
  try {
    const user = resolveTelegramUser(req);
    if (user.is_banned) {
      return res.status(403).json({ success: false, error: "Account suspended by administrator. Please contact support." });
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
    if (result.sector.prize_type === "COINS" && result.sector.prize_value > 0) {
      await processPrizeCommission(user.telegram_id, result.sector.prize_value, `SPINNER_${result.sector.label}`, users);
    }
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message || "Internal error during spin processing"
    });
  }
});
app.post("/api/v1/spinner/verify", (req, res) => {
  const { server_seed, client_seed, nonce } = req.body;
  if (!server_seed || !client_seed || nonce === void 0) {
    return res.status(400).json({ success: false, error: "Missing verification parameters" });
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
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || "Invalid verification payload"
    });
  }
});
app.get("/api/v1/spinner/history", (req, res) => {
  const user = resolveTelegramUser(req);
  const userLogs = spinLogs.filter((l) => l.telegram_id === user.telegram_id).slice(0, 30);
  res.json({
    success: true,
    data: userLogs
  });
});
app.get("/api/v1/lottery/draws", (req, res) => {
  const draws = Array.from(lotteryDraws.values());
  res.json({
    success: true,
    data: draws
  });
});
app.post("/api/v1/lottery/buy-ticket", (req, res) => {
  const user = resolveTelegramUser(req);
  if (user.is_banned) {
    return res.status(403).json({ success: false, error: "Account suspended by administrator. Please contact support." });
  }
  const { draw_id, selected_numbers, use_free_ticket } = req.body;
  const draw = lotteryDraws.get(draw_id);
  if (!draw) {
    return res.status(404).json({ success: false, error: "Draw not found" });
  }
  if (draw.status !== "OPEN") {
    return res.status(400).json({ success: false, error: "Draw is locked or already completed" });
  }
  if (!Array.isArray(selected_numbers) || selected_numbers.length !== 5) {
    return res.status(400).json({ success: false, error: "Please choose exactly 5 numbers (1-35)" });
  }
  const numSet = new Set(selected_numbers.map((n) => Number(n)));
  if (numSet.size !== 5) {
    return res.status(400).json({ success: false, error: "Numbers must be unique" });
  }
  for (const n of numSet) {
    if (n < 1 || n > 35 || !Number.isInteger(n)) {
      return res.status(400).json({ success: false, error: "Numbers must be between 1 and 35" });
    }
  }
  const sortedNumbers = Array.from(numSet).sort((a, b) => a - b);
  if (use_free_ticket && user.free_tickets > 0 && draw.currency === "COINS") {
    user.free_tickets -= 1;
    draw.payout_pool += draw.ticket_price * 0.7;
  } else {
    if (draw.currency === "COINS") {
      if (user.balance_coins < draw.ticket_price) {
        return res.status(400).json({ success: false, error: "Insufficient coins for ticket" });
      }
      user.balance_coins -= draw.ticket_price;
      draw.payout_pool += draw.ticket_price * 0.8;
    } else {
      if (user.balance_stars < draw.ticket_price) {
        return res.status(400).json({ success: false, error: "Insufficient Telegram Stars for ticket" });
      }
      user.balance_stars -= draw.ticket_price;
      draw.payout_pool += draw.ticket_price * 0.85;
    }
  }
  draw.ticket_count += 1;
  const ticket = {
    ticket_id: import_crypto6.default.randomUUID(),
    draw_id: draw.draw_id,
    telegram_id: user.telegram_id,
    username: user.username,
    selected_numbers: sortedNumbers,
    purchase_time: (/* @__PURE__ */ new Date()).toISOString()
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
app.get("/api/v1/lottery/my-tickets", (req, res) => {
  const user = resolveTelegramUser(req);
  const myTickets = lotteryTickets.filter((t) => t.telegram_id === user.telegram_id).map((t) => {
    const draw = lotteryDraws.get(t.draw_id);
    return {
      ...t,
      draw_title: draw?.title || "Unknown Draw",
      draw_status: draw?.status || "UNKNOWN",
      draw_time: draw?.draw_time,
      currency: draw?.currency,
      winning_numbers: draw?.winning_numbers
    };
  }).reverse();
  res.json({
    success: true,
    data: myTickets
  });
});
app.post("/api/v1/lottery/trigger-draw", (req, res) => {
  const { draw_id } = req.body;
  const draw = lotteryDraws.get(draw_id);
  if (!draw) {
    return res.status(404).json({ success: false, error: "Draw not found" });
  }
  if (draw.status === "COMPLETED") {
    return res.status(400).json({ success: false, error: "Draw already completed" });
  }
  const winningNumbers = [];
  let round = 0;
  while (winningNumbers.length < 5) {
    const hash = import_crypto6.default.createHmac("sha256", draw.server_seed).update(`draw_round_${round}`).digest("hex");
    const num = parseInt(hash.substring(0, 8), 16) % 35 + 1;
    if (!winningNumbers.includes(num)) {
      winningNumbers.push(num);
    }
    round++;
  }
  winningNumbers.sort((a, b) => a - b);
  draw.status = "COMPLETED";
  draw.winning_numbers = winningNumbers;
  const ticketsForDraw = lotteryTickets.filter((t) => t.draw_id === draw_id);
  let winnersCount = 0;
  let totalDistributed = 0;
  for (const t of ticketsForDraw) {
    const matches = t.selected_numbers.filter((n) => winningNumbers.includes(n)).length;
    t.matches = matches;
    let reward = 0;
    if (matches === 5) {
      reward = Math.round(draw.payout_pool * 0.7);
    } else if (matches === 4) {
      reward = Math.round(draw.payout_pool * 0.2);
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
        if (draw.currency === "COINS") {
          ticketUser.balance_coins += reward;
          processPrizeCommission(ticketUser.telegram_id, reward, `LOTTERY_${draw.title}`, users).catch(() => {
          });
        } else {
          ticketUser.balance_stars += reward;
        }
      }
    }
  }
  const nextDrawId = `draw-${Date.now().toString(36)}`;
  const nextSeed = import_crypto6.default.randomBytes(32).toString("hex");
  const nextDrawTime = new Date(Date.now() + 30 * 60 * 1e3).toISOString();
  lotteryDraws.set(nextDrawId, {
    draw_id: nextDrawId,
    title: draw.title,
    ticket_price: draw.ticket_price,
    currency: draw.currency,
    payout_pool: Math.max(500, Math.round(draw.payout_pool * 0.5)),
    status: "OPEN",
    draw_time: nextDrawTime,
    winning_numbers: null,
    server_seed: nextSeed,
    server_seed_hash: import_crypto6.default.createHash("sha256").update(nextSeed).digest("hex"),
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
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
app.use(
  "/api/v1/admin",
  createAdminRouter({
    users,
    lotteryDraws,
    lotteryTickets,
    SPINNER_SECTORS,
    spinLogs
  })
);
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.path}`
  });
});
app.use((err, req, res, next) => {
  if (req.path.startsWith("/api")) {
    console.error("API Error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Internal Server Error"
    });
  }
  next(err);
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express3.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Telegram Mini App Lotto Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
