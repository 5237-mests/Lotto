import React, { useState } from 'react';
import { PlusCircle, Sparkles, User, RefreshCw, Send, ShieldCheck, Wallet } from 'lucide-react';
import { UserProfile, UserBalances } from '../types';
import { apiFetch } from '../utils/api';

interface HeaderNavProps {
  user: UserProfile | null;
  balances: UserBalances;
  onBalanceUpdate: (balances: UserBalances) => void;
  telegramUserId: number;
  onSwitchUser: (id: number) => void;
  onOpenAdmin?: () => void;
  onOpenDeposit?: () => void;
}

export function HeaderNav({
  user,
  balances,
  onBalanceUpdate,
  telegramUserId,
  onSwitchUser,
  onOpenAdmin,
  onOpenDeposit,
}: HeaderNavProps) {
  const [isFauceting, setIsFauceting] = useState<boolean>(false);
  const [faucetMsg, setFaucetMsg] = useState<string>('');

  const handleFaucet = async () => {
    setIsFauceting(true);
    setFaucetMsg('');
    try {
      const data = await apiFetch('/api/v1/faucet', {
        method: 'POST',
        headers: {
          'x-telegram-user-id': telegramUserId.toString(),
        },
      });
      if (data.success && data.balances) {
        onBalanceUpdate(data.balances);
        setFaucetMsg('+100 Coins & 2 Tickets!');
        setTimeout(() => setFaucetMsg(''), 3000);
      }
    } catch (err) {
      console.warn('Faucet request failed:', err);
    } finally {
      setIsFauceting(false);
    }
  };

  return (
    <header className="w-full max-w-md mx-auto px-4 pt-3 pb-2 space-y-2">
      {/* Top row: Telegram brand & user profile */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white font-bold text-sm shadow">
            <Send className="w-4 h-4 translate-x-[-1px] translate-y-[1px]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm text-white tracking-tight">
                {user?.first_name || 'Lotto Player'}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono">
                TMA
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              @{user?.username || 'user'} • ID: #{telegramUserId.toString().slice(-4)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Deposit Button */}
          {onOpenDeposit && (
            <button
              type="button"
              id="header-deposit-button"
              onClick={onOpenDeposit}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-sm"
              title="Deposit Coins"
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Deposit</span>
            </button>
          )}

          {/* Admin Dashboard button */}
          {onOpenAdmin && (
            <button
              type="button"
              id="header-admin-button"
              onClick={onOpenAdmin}
              className="px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-sm"
              title="Open Operator Admin Dashboard"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>Admin</span>
            </button>
          )}

          {/* Faucet Top-up button */}
          <button
            type="button"
            id="faucet-button"
            onClick={handleFaucet}
            disabled={isFauceting}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{isFauceting ? 'Adding...' : 'Faucet'}</span>
          </button>
        </div>
      </div>

      {faucetMsg && (
        <div className="p-1.5 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center animate-in fade-in">
          {faucetMsg}
        </div>
      )}

      {/* Balance Badges Row */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {/* Coins */}
        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🪙</span>
            <span className="text-[11px] text-slate-400 font-medium">Coins</span>
          </div>
          <span className="font-black text-sm text-white">{Math.round(balances.coins)}</span>
        </div>

        {/* Stars */}
        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-base">⭐</span>
            <span className="text-[11px] text-slate-400 font-medium">Stars</span>
          </div>
          <span className="font-black text-sm text-amber-400">{balances.stars}</span>
        </div>

        {/* Free Tickets */}
        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🎟️</span>
            <span className="text-[11px] text-slate-400 font-medium">Tickets</span>
          </div>
          <span className="font-black text-sm text-emerald-400">{balances.free_tickets}</span>
        </div>
      </div>

      {/* Quick Player Switcher for Demo & Testing */}
      <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[10px] text-slate-400">
        <span>Demo Account:</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSwitchUser(7770001)}
            className={`px-1.5 py-0.5 rounded ${
              telegramUserId === 7770001 ? 'bg-blue-600 text-white font-bold' : 'hover:text-slate-200'
            }`}
          >
            Player 1
          </button>
          <button
            type="button"
            onClick={() => onSwitchUser(7770002)}
            className={`px-1.5 py-0.5 rounded ${
              telegramUserId === 7770002 ? 'bg-blue-600 text-white font-bold' : 'hover:text-slate-200'
            }`}
          >
            Player 2
          </button>
          <button
            type="button"
            onClick={() => onSwitchUser(7770003)}
            className={`px-1.5 py-0.5 rounded ${
              telegramUserId === 7770003 ? 'bg-blue-600 text-white font-bold' : 'hover:text-slate-200'
            }`}
          >
            VIP User
          </button>
        </div>
      </div>
    </header>
  );
}
