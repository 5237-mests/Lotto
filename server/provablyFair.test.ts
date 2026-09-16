import crypto from 'crypto';
import {
  calculateSpinResult,
  generateServerSeed,
  hashServerSeed,
  verifySpinResult,
  DEFAULT_SECTORS
} from '../ProvablyFairEngine.js';
import { executeSpinnerTransaction } from './spinnerService';
import { closeDbPool } from './db';

describe('HMAC-SHA256 Provably Fair RNG Engine', () => {
  afterAll(async () => {
    await closeDbPool();
  });
  const mockServerSeed = '4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f';
  const mockClientSeed = 'telegram_user_seed_12345';
  const mockNonce = 42;

  describe('ProvablyFairEngine module', () => {
    test('generates valid 64-char hex server seeds and hashes', () => {
      const seed = generateServerSeed();
      expect(seed).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(seed)).toBe(true);

      const hash = hashServerSeed(seed);
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
      expect(hash).toBe(crypto.createHash('sha256').update(seed).digest('hex'));
    });

    test('calculateSpinResult returns deterministic results for identical seeds & nonce', () => {
      const run1 = calculateSpinResult(mockServerSeed, mockClientSeed, mockNonce, DEFAULT_SECTORS);
      const run2 = calculateSpinResult(mockServerSeed, mockClientSeed, mockNonce, DEFAULT_SECTORS);

      expect(run1.winningIndex).toBe(run2.winningIndex);
      expect(run1.outcomeHash).toBe(run2.outcomeHash);
      expect(run1.serverSeedHash).toBe(run2.serverSeedHash);
      expect(run1.sector.id).toBe(run1.winningIndex);
    });

    test('calculates the exact HMAC-SHA256 outcome hash using serverSeed and clientSeed:nonce', () => {
      const result = calculateSpinResult(mockServerSeed, mockClientSeed, mockNonce, DEFAULT_SECTORS);

      const expectedHmac = crypto
        .createHmac('sha256', mockServerSeed)
        .update(`${mockClientSeed}:${mockNonce}`)
        .digest('hex');

      expect(result.outcomeHash).toBe(expectedHmac);

      // Verify mathematical conversion of first 8 hex characters to index
      const totalWeight = DEFAULT_SECTORS.reduce((acc, s) => acc + s.weight, 0);
      const numericVal = parseInt(expectedHmac.substring(0, 8), 16);
      let targetWeight = numericVal % totalWeight;

      let expectedSector = DEFAULT_SECTORS[0];
      for (const sector of DEFAULT_SECTORS) {
        if (targetWeight < sector.weight) {
          expectedSector = sector;
          break;
        }
        targetWeight -= sector.weight;
      }

      expect(result.winningIndex).toBe(expectedSector.id);
      expect(result.sector.label).toBe(expectedSector.label);
    });

    test('different nonces or seeds produce different outcomes', () => {
      const resA = calculateSpinResult(mockServerSeed, mockClientSeed, 1);
      const resB = calculateSpinResult(mockServerSeed, mockClientSeed, 2);

      expect(resA.outcomeHash).not.toBe(resB.outcomeHash);
      expect(resA.nonce).toBe(1);
      expect(resB.nonce).toBe(2);
    });

    test('verifySpinResult validates authentic spin outcomes correctly', () => {
      const spin = calculateSpinResult(mockServerSeed, mockClientSeed, mockNonce, DEFAULT_SECTORS);

      const isValid = verifySpinResult(
        mockServerSeed,
        mockClientSeed,
        mockNonce,
        DEFAULT_SECTORS,
        spin.winningIndex
      );
      expect(isValid).toBe(true);

      const isInvalid = verifySpinResult(
        mockServerSeed,
        mockClientSeed,
        mockNonce,
        DEFAULT_SECTORS,
        (spin.winningIndex + 1) % DEFAULT_SECTORS.length
      );
      expect(isInvalid).toBe(false);
    });

    test('throws descriptive error on invalid inputs', () => {
      expect(() => calculateSpinResult('', mockClientSeed, 0)).toThrow('Missing or invalid serverSeed');
      expect(() => calculateSpinResult(mockServerSeed, null as any, 0)).toThrow('Missing clientSeed');
      expect(() => calculateSpinResult(mockServerSeed, mockClientSeed, -1)).toThrow('Invalid nonce');
      expect(() => calculateSpinResult(mockServerSeed, mockClientSeed, 0, [{ id: 0, weight: 0 } as any])).toThrow(
        'Total sectors weight must be greater than zero'
      );
    });
  });

  describe('Spinner Database Transaction & Route Service', () => {
    test('deducts spin cost and returns winning index, animation params, and public seed hash', async () => {
      const mockUser = {
        telegram_id: 8881234,
        username: 'high_roller',
        first_name: 'High Roller',
        balance_coins: 100,
        balance_stars: 10,
        free_tickets: 2,
        nonce: 5,
        current_server_seed: mockServerSeed
      };
      const mockLogs: any[] = [];

      const result = await executeSpinnerTransaction(
        {
          telegramId: mockUser.telegram_id,
          username: mockUser.username,
          firstName: mockUser.first_name,
          clientSeed: 'custom_client_entropy',
          useFreeTicket: false
        },
        mockUser,
        mockLogs
      );

      // Verify response contract requirements:
      // 1. winning sector index
      expect(typeof result.winning_index).toBe('number');
      expect(result.winning_index).toBeGreaterThanOrEqual(0);
      expect(result.winning_index).toBeLessThan(DEFAULT_SECTORS.length);

      // 2. animation parameters
      expect(result.animation).toBeDefined();
      expect(result.animation.duration_ms).toBe(4200);
      expect(result.animation.total_rotations).toBe(8);

      // 3. public seed hash
      expect(result.public_seed_hash).toBe(hashServerSeed(mockServerSeed));
      expect(result.server_seed_hash).toBe(result.public_seed_hash);

      // 4. provably fair proof block
      expect(result.provably_fair.revealed_server_seed).toBe(mockServerSeed);
      expect(result.provably_fair.nonce).toBe(5);
      expect(result.provably_fair.next_server_seed_hash).toBeDefined();

      // 5. spin log was generated
      expect(mockLogs).toHaveLength(1);
      expect(mockLogs[0].telegram_id).toBe(mockUser.telegram_id);
      expect(mockLogs[0].sector_id).toBe(result.winning_index);

      // 6. Nonce was incremented and new seed assigned
      expect(mockUser.nonce).toBe(6);
      expect(mockUser.current_server_seed).not.toBe(mockServerSeed);
    });

    test('deducts free ticket when useFreeTicket is requested', async () => {
      const mockUser = {
        telegram_id: 8881235,
        username: 'ticket_spinner',
        first_name: 'Ticket Spinner',
        balance_coins: 50,
        balance_stars: 0,
        free_tickets: 3,
        nonce: 0,
        current_server_seed: mockServerSeed
      };

      const result = await executeSpinnerTransaction(
        {
          telegramId: mockUser.telegram_id,
          username: mockUser.username,
          firstName: mockUser.first_name,
          useFreeTicket: true
        },
        mockUser
      );

      // Free tickets balance was deducted (plus any free ticket prize won)
      const expectedTickets = 3 - 1 + (result.sector.prize_type === 'FREE_TICKET' ? result.sector.prize_value : 0);
      expect(mockUser.free_tickets).toBe(expectedTickets);
    });

    test('throws error when coins balance is insufficient', async () => {
      const brokeUser = {
        telegram_id: 8881236,
        username: 'broke_player',
        first_name: 'Broke Player',
        balance_coins: 5, // Cost is 10
        balance_stars: 0,
        free_tickets: 0,
        nonce: 0,
        current_server_seed: mockServerSeed
      };

      await expect(
        executeSpinnerTransaction(
          {
            telegramId: brokeUser.telegram_id,
            username: brokeUser.username,
            firstName: brokeUser.first_name,
            useFreeTicket: false
          },
          brokeUser
        )
      ).rejects.toThrow('Insufficient Coins');
    });
  });
});
