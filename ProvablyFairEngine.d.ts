import { SpinnerSector } from './src/types';

export interface ProvablyFairResult {
  winningIndex: number;
  winning_index: number;
  sector: SpinnerSector;
  outcomeHash: string;
  outcome_hash: string;
  serverSeed: string;
  server_seed: string;
  serverSeedHash: string;
  server_seed_hash: string;
  clientSeed: string;
  client_seed: string;
  nonce: number;
  totalWeight: number;
  rawNumber: number;
}

export declare const DEFAULT_SECTORS: SpinnerSector[];

export declare function generateServerSeed(): string;

export declare function hashServerSeed(serverSeed: string): string;

export declare function calculateSpinResult(
  serverSeed: string,
  clientSeed: string,
  nonce: number | string,
  sectors?: SpinnerSector[]
): ProvablyFairResult;

export declare function verifySpinResult(
  serverSeed: string,
  clientSeed: string,
  nonce: number | string,
  sectors: SpinnerSector[],
  expectedIndex: number
): boolean;

declare const _default: {
  calculateSpinResult: typeof calculateSpinResult;
  generateServerSeed: typeof generateServerSeed;
  hashServerSeed: typeof hashServerSeed;
  verifySpinResult: typeof verifySpinResult;
  DEFAULT_SECTORS: typeof DEFAULT_SECTORS;
};

export default _default;
