import type { FC } from 'react';
import { UserBalances, SpinnerSector } from '../types';

export interface SpinnerWheelProps {
  initData?: string;
  balances: UserBalances;
  onBalanceUpdate: (balances: UserBalances) => void;
  onNavigateToVerifier: (serverSeed: string, clientSeed: string, nonce: number) => void;
  telegramUserId: number;
}

export declare const DEFAULT_SPINNER_SECTORS: SpinnerSector[];
export declare const SpinnerWheel: FC<SpinnerWheelProps>;
export default SpinnerWheel;
