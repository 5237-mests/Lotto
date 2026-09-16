import crypto from 'crypto';

/**
 * Standard Lottery Spinner Sectors Blueprint
 */
export const DEFAULT_SECTORS = [
  { id: 0, label: 'Try Again', weight: 400, prize_type: 'NO_WIN', prize_value: 0, color: '#1E293B' },
  { id: 1, label: '10 Coins', weight: 300, prize_type: 'COINS', prize_value: 10, color: '#0EA5E9' },
  { id: 2, label: '1 Free Ticket', weight: 200, prize_type: 'FREE_TICKET', prize_value: 1, color: '#10B981' },
  { id: 3, label: '50 Coins', weight: 90, prize_type: 'COINS', prize_value: 50, color: '#F59E0B' },
  { id: 4, label: 'JACKPOT (500)', weight: 10, prize_type: 'COINS', prize_value: 500, color: '#EF4444' }
];

/**
 * Generates a cryptographically secure 256-bit (32-byte) server seed hex string.
 * @returns {string} 64-character hexadecimal server seed
 */
export function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates SHA256 commitment hash of a server seed.
 * @param {string} serverSeed
 * @returns {string} 64-character hexadecimal hash
 */
export function hashServerSeed(serverSeed) {
  if (!serverSeed || typeof serverSeed !== 'string') {
    throw new Error('Invalid serverSeed: must be a non-empty string');
  }
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

/**
 * Converts an HMAC-SHA256 outcome hash into a deterministic weighted sector selection.
 *
 * Algorithm:
 * 1. Compute total cumulative weight of all active sectors.
 * 2. Calculate HMAC-SHA256 using serverSeed as secret and `${clientSeed}:${nonce}` as message.
 * 3. Convert the leading 8 hex characters (32-bit unsigned integer) of the HMAC hash.
 * 4. Modulo the integer against total weight to get deterministic target slot.
 * 5. Traverse sectors cumulatively until the target weight is met.
 *
 * @param {string} serverSeed - Secret server seed for the round
 * @param {string} clientSeed - User-provided or client-generated seed
 * @param {number|string} nonce - Monotonically increasing round counter for the user
 * @param {Array<Object>} [sectors=DEFAULT_SECTORS] - Array of sector configurations with weights
 * @returns {Object} Provably fair calculation result with winning index, sector, and cryptographic proofs
 */
export function calculateSpinResult(serverSeed, clientSeed, nonce, sectors = DEFAULT_SECTORS) {
  if (!serverSeed || typeof serverSeed !== 'string') {
    throw new Error('Missing or invalid serverSeed');
  }

  if (clientSeed === undefined || clientSeed === null) {
    throw new Error('Missing clientSeed');
  }

  const safeClientSeed = String(clientSeed).trim();
  const safeNonce = Number(nonce);

  if (isNaN(safeNonce) || safeNonce < 0) {
    throw new Error('Invalid nonce: must be a non-negative number');
  }

  const activeSectors = Array.isArray(sectors) && sectors.length > 0 ? sectors : DEFAULT_SECTORS;

  // 1. Calculate total weight
  const totalWeight = activeSectors.reduce((sum, s) => {
    const w = Number(s.weight);
    return sum + (isNaN(w) || w <= 0 ? 0 : w);
  }, 0);

  if (totalWeight <= 0) {
    throw new Error('Total sectors weight must be greater than zero');
  }

  // 2. Compute HMAC-SHA256(serverSeed, clientSeed + ":" + nonce)
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${safeClientSeed}:${safeNonce}`);
  const outcomeHash = hmac.digest('hex');

  // 3. Convert first 8 hex characters (32 bits) into unsigned integer
  const numericValue = parseInt(outcomeHash.substring(0, 8), 16);
  let randomWeight = numericValue % totalWeight;

  // 4. Select sector according to cumulative weights
  let winningSector = activeSectors[0];
  let winningIndex = activeSectors[0].id !== undefined ? activeSectors[0].id : 0;

  for (let i = 0; i < activeSectors.length; i++) {
    const sector = activeSectors[i];
    const weight = Number(sector.weight) || 0;
    if (randomWeight < weight) {
      winningSector = sector;
      winningIndex = sector.id !== undefined ? sector.id : i;
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

/**
 * Verifies a previous spin calculation independently.
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number|string} nonce
 * @param {Array<Object>} sectors
 * @param {number} expectedIndex
 * @returns {boolean}
 */
export function verifySpinResult(serverSeed, clientSeed, nonce, sectors, expectedIndex) {
  try {
    const result = calculateSpinResult(serverSeed, clientSeed, nonce, sectors);
    return result.winningIndex === expectedIndex;
  } catch {
    return false;
  }
}

export default {
  calculateSpinResult,
  generateServerSeed,
  hashServerSeed,
  verifySpinResult,
  DEFAULT_SECTORS
};
