import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

export interface ValidatedTelegramWebAppData {
  user?: TelegramUser;
  query_id?: string;
  auth_date: number;
  hash: string;
  rawParams: Record<string, string>;
}

declare global {
  namespace Express {
    interface Request {
      telegramData?: ValidatedTelegramWebAppData;
      telegramUser?: TelegramUser;
    }
  }
}

/**
 * Validates Telegram WebApp initData string using standard HMAC-SHA256 protocol.
 * According to Telegram documentation:
 * 1. Parse query string into key-value pairs
 * 2. Extract and remove 'hash'
 * 3. Sort remaining pairs alphabetically by key
 * 4. Join with newline '\n' in "key=value" format -> data_check_string
 * 5. Secret key = HMAC_SHA256("WebAppData", bot_token)
 * 6. Calculated hash = HMAC_SHA256(secret_key, data_check_string) as hex
 * 7. Compare calculated hash with provided hash
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400 // Optional expiration check (e.g. 24h)
): { valid: boolean; data?: ValidatedTelegramWebAppData; error?: string } {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, error: 'Missing initData' };
  }

  if (!botToken) {
    return { valid: false, error: 'Missing BOT_TOKEN server configuration' };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      return { valid: false, error: 'Missing hash parameter in initData' };
    }

    // Extract auth_date
    const authDateStr = params.get('auth_date');
    if (!authDateStr) {
      return { valid: false, error: 'Missing auth_date parameter in initData' };
    }

    const authDate = parseInt(authDateStr, 10);
    if (isNaN(authDate)) {
      return { valid: false, error: 'Invalid auth_date parameter in initData' };
    }

    // Optional expiration verification
    if (maxAgeSeconds > 0) {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (currentTimestamp - authDate > maxAgeSeconds) {
        return { valid: false, error: 'InitData has expired' };
      }
    }

    // Filter out 'hash' and sort alphabetically
    const keys: string[] = [];
    const rawParams: Record<string, string> = {};

    params.forEach((value, key) => {
      rawParams[key] = value;
      if (key !== 'hash') {
        keys.push(key);
      }
    });

    keys.sort();
    const dataCheckString = keys.map((key) => `${key}=${rawParams[key]}`).join('\n');

    // Secret Key = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Calculated Hash = HMAC_SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Secure timing-safe comparison
    const hashBuffer = Buffer.from(hash, 'utf-8');
    const calculatedBuffer = Buffer.from(calculatedHash, 'utf-8');

    if (hashBuffer.length !== calculatedBuffer.length || !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
      return { valid: false, error: 'Invalid HMAC signature' };
    }

    let user: TelegramUser | undefined;
    const userStr = rawParams.user;
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch {
        return { valid: false, error: 'Malformed user payload in initData' };
      }
    }

    return {
      valid: true,
      data: {
        user,
        query_id: rawParams.query_id,
        auth_date: authDate,
        hash,
        rawParams,
      },
    };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Verification failed' };
  }
}

/**
 * Express.js middleware function verifyTelegramWebAppData
 * Parses Telegram.WebApp.initData from:
 * - Authorization header: "tma <initData>" or "Bearer <initData>"
 * - Custom header: 'x-telegram-init-data'
 * - Request body: req.body.initData
 * Verifies HMAC signature against BOT_TOKEN and populates req.telegramUser & req.telegramData.
 * Strictly returns 401 Unauthorized if invalid or missing.
 */
export function verifyTelegramWebAppData(req: Request, res: Response, next: NextFunction): void {
  const botToken = process.env.BOT_TOKEN;

  let rawInitData: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('tma ')) {
      rawInitData = authHeader.slice(4).trim();
    } else if (authHeader.startsWith('Bearer ')) {
      rawInitData = authHeader.slice(7).trim();
    }
  }

  if (!rawInitData && req.headers['x-telegram-init-data']) {
    rawInitData = req.headers['x-telegram-init-data'] as string;
  }

  if (!rawInitData && req.body && typeof req.body.initData === 'string') {
    rawInitData = req.body.initData;
  }

  if (!rawInitData) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing Telegram WebApp initData',
    });
    return;
  }

  if (!botToken) {
    // In dev mode when BOT_TOKEN is not configured, check if explicit simulation header is used
    if (process.env.NODE_ENV !== 'production' && req.headers['x-bypass-telegram-auth'] === 'true') {
      req.telegramUser = { id: 7770001, first_name: 'Dev User', username: 'dev_user' };
      return next();
    }

    res.status(401).json({
      success: false,
      error: 'Unauthorized: Telegram Bot Token not configured on server',
    });
    return;
  }

  const result = validateTelegramInitData(rawInitData, botToken);

  if (!result.valid || !result.data) {
    res.status(401).json({
      success: false,
      error: `Unauthorized: ${result.error || 'Invalid initData signature'}`,
    });
    return;
  }

  req.telegramData = result.data;
  req.telegramUser = result.data.user;

  next();
}
