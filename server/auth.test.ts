import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { verifyTelegramWebAppData, validateTelegramInitData } from './auth';

describe('Telegram WebApp HMAC-SHA256 Auth & Middleware', () => {
  const TEST_BOT_TOKEN = '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ_1234567';

  beforeEach(() => {
    process.env.BOT_TOKEN = TEST_BOT_TOKEN;
  });

  afterEach(() => {
    delete process.env.BOT_TOKEN;
  });

  // Helper to generate a valid Telegram initData query string
  function generateValidInitData(
    userData: Record<string, any>,
    botToken: string,
    authDate: number = Math.floor(Date.now() / 1000)
  ): string {
    const rawParams: Record<string, string> = {
      auth_date: authDate.toString(),
      query_id: 'AAG6z-81AAAAALrP7zV1g4y7',
      user: JSON.stringify(userData),
    };

    const keys = Object.keys(rawParams).sort();
    const dataCheckString = keys.map((k) => `${k}=${rawParams[k]}`).join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const hash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(rawParams)) {
      params.append(k, v);
    }
    params.append('hash', hash);

    return params.toString();
  }

  describe('validateTelegramInitData helper', () => {
    it('successfully validates genuine Telegram initData', () => {
      const user = { id: 777001, first_name: 'Pavel', username: 'durov' };
      const validInitData = generateValidInitData(user, TEST_BOT_TOKEN);

      const result = validateTelegramInitData(validInitData, TEST_BOT_TOKEN);
      expect(result.valid).toBe(true);
      expect(result.data?.user?.id).toBe(777001);
      expect(result.data?.user?.username).toBe('durov');
      expect(result.data?.user?.first_name).toBe('Pavel');
    });

    it('rejects initData signed with wrong bot token', () => {
      const user = { id: 777001, first_name: 'Pavel' };
      const forgedInitData = generateValidInitData(user, '999999999:WrongTokenHere');

      const result = validateTelegramInitData(forgedInitData, TEST_BOT_TOKEN);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid HMAC signature/i);
    });

    it('rejects initData if payload data was tampered with after signing', () => {
      const user = { id: 777001, first_name: 'Pavel' };
      const validInitData = generateValidInitData(user, TEST_BOT_TOKEN);

      // Attacker attempts to change user id to an admin's ID
      const tamperedInitData = validInitData.replace('777001', '100001');

      const result = validateTelegramInitData(tamperedInitData, TEST_BOT_TOKEN);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid HMAC signature/i);
    });

    it('rejects initData missing hash', () => {
      const result = validateTelegramInitData('user=%7B%22id%22%3A123%7D&auth_date=1600000000', TEST_BOT_TOKEN);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Missing hash/i);
    });

    it('rejects expired initData when maxAge is enforced', () => {
      const user = { id: 777001, first_name: 'Pavel' };
      const oldTimestamp = Math.floor(Date.now() / 1000) - 100000; // > 24h old
      const expiredInitData = generateValidInitData(user, TEST_BOT_TOKEN, oldTimestamp);

      const result = validateTelegramInitData(expiredInitData, TEST_BOT_TOKEN, 86400);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/expired/i);
    });
  });

  describe('verifyTelegramWebAppData Express Middleware', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());

      app.get('/protected', verifyTelegramWebAppData, (req, res) => {
        res.json({
          success: true,
          user: req.telegramUser,
          auth_date: req.telegramData?.auth_date,
        });
      });

      app.post('/protected', verifyTelegramWebAppData, (req, res) => {
        res.json({
          success: true,
          user: req.telegramUser,
        });
      });
    });

    it('strictly returns 401 Unauthorized when no initData is provided', async () => {
      const res = await request(app).get('/protected');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Unauthorized: Missing Telegram WebApp initData');
    });

    it('strictly returns 401 Unauthorized when invalid signature is passed via Authorization header', async () => {
      const user = { id: 12345, first_name: 'Hacker' };
      const invalidInitData = generateValidInitData(user, 'INVALID_SECRET_TOKEN');

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `tma ${invalidInitData}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Unauthorized: Invalid HMAC signature');
    });

    it('strictly returns 401 Unauthorized when tampered signature is passed via x-telegram-init-data header', async () => {
      const user = { id: 999, first_name: 'Attacker' };
      const valid = generateValidInitData(user, TEST_BOT_TOKEN);
      const tampered = valid.replace('hash=', 'hash=deadbeef');

      const res = await request(app)
        .get('/protected')
        .set('x-telegram-init-data', tampered);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Unauthorized: Invalid HMAC signature');
    });

    it('strictly returns 401 Unauthorized when invalid signature is passed in request body', async () => {
      const now = Math.floor(Date.now() / 1000);
      const res = await request(app)
        .post('/protected')
        .send({ initData: `auth_date=${now}&query_id=test_query&user=%7B%22id%22%3A123%7D&hash=deadbeefcafe00112233445566778899aabbccddeeff00112233445566778899aabb` });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Unauthorized: Invalid HMAC signature');
    });

    it('successfully allows valid request and extracts req.telegramUser', async () => {
      const user = { id: 888123, first_name: 'Alice', username: 'alice_crypto' };
      const valid = generateValidInitData(user, TEST_BOT_TOKEN);

      const res = await request(app)
        .get('/protected')
        .set('Authorization', `tma ${valid}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toEqual(user);
    });
  });
});
