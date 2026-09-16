import React, { useState } from 'react';
import { X, Wallet, Coins, ArrowRight, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { UserBalances } from '../types';
import { apiFetch } from '../utils/api';
import { triggerHaptic } from '../utils/sound';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramUserId: number;
  onSuccess: (balances: UserBalances) => void;
}

export function DepositModal({ isOpen, onClose, telegramUserId, onSuccess }: DepositModalProps) {
  const [amount, setAmount] = useState<number>(100);
  const [loading, setLoading] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{
    deposited: number;
    referrerId?: number;
    commissionCoins?: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDeposit = async () => {
    if (amount <= 0) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessInfo(null);

    try {
      const res = await apiFetch<{
        success: boolean;
        message: string;
        deposit_amount: number;
        balances: UserBalances;
        referral_commission?: {
          referrer_id: number;
          commission_coins: number;
        } | null;
      }>('/api/v1/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-user-id': telegramUserId.toString(),
        },
        body: JSON.stringify({ amount }),
      });

      if (res.success && res.balances) {
        triggerHaptic('heavy');
        onSuccess(res.balances);
        setSuccessInfo({
          deposited: res.deposit_amount,
          referrerId: res.referral_commission?.referrer_id,
          commissionCoins: res.referral_commission?.commission_coins,
        });
      } else {
        triggerHaptic('light');
        setErrorMsg(res.error || 'Deposit failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Deposit network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-5 space-y-4 shadow-2xl relative text-white">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">Deposit Coins</h3>
              <p className="text-[10px] text-slate-400">Instant Telegram In-App Top Up</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {successInfo ? (
          <div className="space-y-4 py-3 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-lg font-black text-white">+{successInfo.deposited} Coins Deposited!</h4>
              <p className="text-xs text-slate-300 mt-1">
                Your account balance has been updated immediately.
              </p>
            </div>

            {successInfo.commissionCoins ? (
              <div className="p-3 rounded-2xl bg-blue-950/50 border border-blue-500/30 text-xs text-blue-300 flex items-center gap-2 text-left">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>10% Referral Commission</strong>: +{successInfo.commissionCoins} Coins paid automatically to your inviter (ID #{successInfo.referrerId})!
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setSuccessInfo(null);
                onClose();
              }}
              className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-xs text-slate-300 font-semibold">Select Amount</span>
              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 250, 500].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setAmount(preset);
                    }}
                    className={`py-2 rounded-xl text-xs font-bold transition ${
                      amount === preset
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div className="space-y-1">
              <span className="text-xs text-slate-300 font-semibold">Or Enter Custom Coins</span>
              <div className="flex items-center px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus-within:border-emerald-500 transition">
                <Coins className="w-4 h-4 text-amber-400 mr-2 shrink-0" />
                <input
                  type="number"
                  min="10"
                  max="10000"
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-transparent text-sm font-bold text-white outline-none font-mono"
                />
                <span className="text-xs text-slate-500 font-semibold ml-1">COINS</span>
              </div>
            </div>

            {/* 10% Referral notice */}
            <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>10% Affiliate Guarantee</strong>: If you joined via a friend's invite link, 10% ({Math.round(amount * 0.10)} Coins) will be automatically credited to them as a lifetime commission.
              </span>
            </div>

            {errorMsg && (
              <div className="p-2 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              id="confirm-deposit-btn"
              onClick={handleDeposit}
              disabled={loading || amount <= 0}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <span>Processing Deposit...</span>
              ) : (
                <>
                  <span>Deposit {amount} Coins</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
