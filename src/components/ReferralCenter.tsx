import React, { useState, useEffect } from 'react';
import {
  Users,
  Gift,
  Share2,
  Copy,
  Check,
  QrCode,
  TrendingUp,
  Percent,
  Award,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  Wallet,
  Coins,
  ChevronRight,
  UserPlus
} from 'lucide-react';
import { ReferralStats, UserBalances } from '../types';
import { apiFetch } from '../utils/api';
import { triggerHaptic } from '../utils/sound';

interface ReferralCenterProps {
  telegramUserId: number;
  balances: UserBalances;
  onBalanceUpdate: (balances: UserBalances) => void;
  onOpenDeposit?: () => void;
}

export function ReferralCenter({
  telegramUserId,
  balances,
  onBalanceUpdate,
  onOpenDeposit
}: ReferralCenterProps) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [showQr, setShowQr] = useState<boolean>(false);
  const [applyCodeInput, setApplyCodeInput] = useState<string>('');
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applyMessage, setApplyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSimulating, setIsSimulating] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await apiFetch<ReferralStats>('/api/v1/referral/stats', {
        headers: {
          'x-telegram-user-id': telegramUserId.toString(),
        },
      });
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.warn('Failed to load referral stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [telegramUserId]);

  const handleCopyLink = () => {
    if (!stats) return;
    triggerHaptic('medium');
    navigator.clipboard.writeText(stats.invite_link);
    setCopied(true);
    showToast('Invite link copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareTelegram = () => {
    if (!stats) return;
    triggerHaptic('heavy');
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(stats.telegram_share_url);
    } else {
      window.open(stats.telegram_share_url, '_blank');
    }
  };

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3500);
  };

  const handleApplyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyCodeInput.trim()) return;

    setIsApplying(true);
    setApplyMessage(null);
    try {
      const res = await apiFetch<{
        message: string;
        bonus_received: number;
        balances: UserBalances;
      }>('/api/v1/referral/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-user-id': telegramUserId.toString(),
        },
        body: JSON.stringify({ referral_code: applyCodeInput.trim() }),
      });

      if (res.success && res.balances) {
        triggerHaptic('heavy');
        onBalanceUpdate(res.balances);
        setApplyMessage({ type: 'success', text: res.message || 'Referral applied! +50 Coins awarded.' });
        setApplyCodeInput('');
        fetchStats();
      } else {
        triggerHaptic('light');
        setApplyMessage({ type: 'error', text: res.error || 'Failed to apply referral code.' });
      }
    } catch (err: any) {
      setApplyMessage({ type: 'error', text: err.message || 'Error communicating with referral service.' });
    } finally {
      setIsApplying(false);
    }
  };

  const handleSimulate = async (action: 'JOIN' | 'DEPOSIT' | 'WIN') => {
    setIsSimulating(action);
    try {
      const res = await apiFetch<{
        message: string;
        earned_coins: number;
        balances: UserBalances;
        stats: ReferralStats;
      }>('/api/v1/referral/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-user-id': telegramUserId.toString(),
        },
        body: JSON.stringify({ action }),
      });

      if (res.success) {
        triggerHaptic('heavy');
        if (res.balances) {
          onBalanceUpdate(res.balances);
        }
        if (res.stats) {
          setStats(res.stats);
        }
        showToast(res.message);
      }
    } catch (err) {
      console.warn('Simulation error:', err);
    } finally {
      setIsSimulating(null);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in pb-4">
      {/* Action Toast Notification */}
      {actionToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-2xl flex items-center gap-2 border border-emerald-400/40 animate-in slide-in-from-top-4">
          <Sparkles className="w-4 h-4 shrink-0 text-amber-300" />
          <span>{actionToast}</span>
        </div>
      )}

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-900/60 via-slate-900/90 to-purple-950/70 border border-blue-500/30 p-5 shadow-xl">
        <div className="absolute top-0 right-0 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 text-[10px] font-extrabold uppercase tracking-wider">
              Telegram Affiliate Program
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
              10% Lifetime RevShare
            </span>
          </div>

          <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            Invite Friends & Earn Coins
          </h2>

          <p className="text-xs text-slate-300 leading-relaxed">
            Share your unique Telegram link. Receive <span className="text-amber-400 font-bold">50 Coins</span> when a friend joins, plus an ongoing <span className="text-emerald-400 font-bold">10% commission</span> on every deposit and lottery/spinner prize they win for life!
          </p>
        </div>
      </div>

      {/* 3 Core Reward Pillars */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center text-center">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-1.5 shadow-inner">
            <Gift className="w-4 h-4" />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Friend Signup</span>
          <span className="text-sm font-black text-amber-300">+50 Coins</span>
          <span className="text-[9px] text-slate-500 mt-0.5">Instant credit</span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center text-center">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-1.5 shadow-inner">
            <Percent className="w-4 h-4" />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Friend Deposits</span>
          <span className="text-sm font-black text-emerald-400">10% Cut</span>
          <span className="text-[9px] text-slate-500 mt-0.5">Every deposit</span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center text-center">
          <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center mb-1.5 shadow-inner">
            <Award className="w-4 h-4" />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Friend Wins</span>
          <span className="text-sm font-black text-purple-300">10% Prize</span>
          <span className="text-[9px] text-slate-500 mt-0.5">Wheels & Lotto</span>
        </div>
      </div>

      {/* Unique Telegram Invite Link Card */}
      <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-blue-400" />
            Your Unique Telegram Link
          </span>
          <button
            type="button"
            onClick={() => setShowQr(!showQr)}
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{showQr ? 'Hide QR' : 'Show QR'}</span>
          </button>
        </div>

        {/* Link Box */}
        <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-950 border border-slate-800/90">
          <input
            type="text"
            readOnly
            value={stats?.invite_link || `https://t.me/LuckyFortuneLottoBot?startapp=ref_${telegramUserId}`}
            className="bg-transparent text-xs text-blue-300 font-mono flex-1 outline-none truncate select-all"
          />
          <button
            type="button"
            id="copy-invite-link-btn"
            onClick={handleCopyLink}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 transition active:scale-95 shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* QR Code view */}
        {showQr && (
          <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 animate-in fade-in">
            <div className="p-3 bg-white rounded-2xl shadow-inner">
              {/* Clean vector simulated QR code matrix */}
              <svg className="w-36 h-36" viewBox="0 0 100 100" fill="currentColor">
                <path d="M5,5 h30 v30 h-30 z M10,10 v20 h20 v-20 z M15,15 h10 v10 h-10 z" fill="#000" />
                <path d="M65,5 h30 v30 h-30 z M70,10 v20 h20 v-20 z M75,15 h10 v10 h-10 z" fill="#000" />
                <path d="M5,65 h30 v30 h-30 z M10,70 v20 h20 v-20 z M15,75 h10 v10 h-10 z" fill="#000" />
                <rect x="45" y="10" width="10" height="10" fill="#000" />
                <rect x="45" y="30" width="10" height="15" fill="#000" />
                <rect x="10" y="45" width="20" height="10" fill="#000" />
                <rect x="40" y="45" width="20" height="20" fill="#000" />
                <rect x="70" y="45" width="15" height="10" fill="#000" />
                <rect x="50" y="70" width="10" height="20" fill="#000" />
                <rect x="70" y="70" width="20" height="20" fill="#000" />
              </svg>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Scan with Telegram Camera
            </span>
          </div>
        )}

        {/* Primary CTA Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            id="share-telegram-btn"
            onClick={handleShareTelegram}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition active:scale-95"
          >
            <Share2 className="w-4 h-4" />
            <span>Share to Telegram</span>
          </button>

          <button
            type="button"
            id="copy-code-btn"
            onClick={() => {
              triggerHaptic('medium');
              navigator.clipboard.writeText(`ref_${telegramUserId}`);
              showToast('Referral Code "ref_' + telegramUserId + '" copied!');
            }}
            className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition active:scale-95"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Code: ref_{telegramUserId}</span>
          </button>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-200">Your Referral Earnings</span>
          </div>
          <button
            type="button"
            onClick={fetchStats}
            className="text-slate-400 hover:text-slate-200 text-[11px] flex items-center gap-1 transition"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Total Friends */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block mb-0.5">Friends Invited</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-white">{stats?.total_friends_referred || 0}</span>
              <span className="text-[10px] text-slate-500 font-medium">players</span>
            </div>
          </div>

          {/* Total Commission */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block mb-0.5">Total Coins Earned</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-amber-400">{stats?.total_commission_earned || 0}</span>
              <span className="text-[10px] text-amber-500 font-bold">🪙 Coins</span>
            </div>
          </div>
        </div>

        {/* Detailed Earnings Category Split */}
        <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800/50 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1 text-[11px]">
              <Gift className="w-3.5 h-3.5 text-amber-400" />
              Signup Bonuses (+50 / friend)
            </span>
            <span className="font-bold text-amber-400 font-mono">
              +{stats?.breakdown?.signup_bonuses || 0}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1 text-[11px]">
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              10% Deposit Commissions
            </span>
            <span className="font-bold text-emerald-400 font-mono">
              +{stats?.breakdown?.deposit_commissions || 0}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1 text-[11px]">
              <Award className="w-3.5 h-3.5 text-purple-400" />
              10% Prize Win Commissions
            </span>
            <span className="font-bold text-purple-300 font-mono">
              +{stats?.breakdown?.prize_commissions || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Testing & Verification Sandbox */}
      <div className="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/50 border border-blue-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white">Interactive Commission Simulator</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono">
            Demo Sandbox
          </span>
        </div>

        <p className="text-[11px] text-slate-400 leading-normal">
          Test the entire referral reward loop in real time. Simulate a friend joining, making a deposit, or hitting a jackpot:
        </p>

        <div className="grid grid-cols-3 gap-2 pt-1">
          {/* Simulate Join */}
          <button
            type="button"
            id="sim-join-btn"
            onClick={() => handleSimulate('JOIN')}
            disabled={isSimulating !== null}
            className="p-2.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 flex flex-col items-center text-center transition active:scale-95 disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4 mb-1 text-amber-400" />
            <span className="text-[11px] font-bold">Simulate Join</span>
            <span className="text-[9px] text-amber-400/80 font-mono">+50 Coins</span>
          </button>

          {/* Simulate Deposit */}
          <button
            type="button"
            id="sim-deposit-btn"
            onClick={() => handleSimulate('DEPOSIT')}
            disabled={isSimulating !== null}
            className="p-2.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex flex-col items-center text-center transition active:scale-95 disabled:opacity-50"
          >
            <Wallet className="w-4 h-4 mb-1 text-emerald-400" />
            <span className="text-[11px] font-bold">Friend Deposits</span>
            <span className="text-[9px] text-emerald-400/80 font-mono">+10 Coins (10%)</span>
          </button>

          {/* Simulate Win */}
          <button
            type="button"
            id="sim-win-btn"
            onClick={() => handleSimulate('WIN')}
            disabled={isSimulating !== null}
            className="p-2.5 rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 flex flex-col items-center text-center transition active:scale-95 disabled:opacity-50"
          >
            <Award className="w-4 h-4 mb-1 text-purple-400" />
            <span className="text-[11px] font-bold">Friend Wins 500</span>
            <span className="text-[9px] text-purple-300/80 font-mono">+50 Coins (10%)</span>
          </button>
        </div>
      </div>

      {/* Friends Invited Ledger */}
      <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            Referred Friends ({stats?.friends?.length || 0})
          </span>
          <span className="text-[10px] text-slate-400">Total Profit Generated</span>
        </div>

        {(!stats?.friends || stats.friends.length === 0) ? (
          <div className="py-6 text-center text-slate-500 text-xs space-y-1">
            <Users className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-60" />
            <p className="font-semibold text-slate-400">No friends joined yet</p>
            <p className="text-[11px]">Send your invite link to friends or test with the simulator above!</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {stats.friends.map((friend) => (
              <div
                key={friend.telegram_id}
                className="p-2.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-[11px] font-bold text-blue-300">
                    {friend.first_name?.[0] || 'U'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white leading-tight">
                      {friend.first_name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      @{friend.username} • ID: #{friend.telegram_id.toString().slice(-4)}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-black text-amber-400 font-mono">
                    +{friend.total_commission_generated} 🪙
                  </div>
                  <div className="text-[9px] text-emerald-400 font-semibold">Active</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real-Time Commission Audit Stream */}
      {stats?.recent_rewards && stats.recent_rewards.length > 0 && (
        <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Commission Audit Ledger
          </span>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {stats.recent_rewards.map((reward) => (
              <div
                key={reward.reward_id}
                className="p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                    reward.reward_type === 'SIGNUP_BONUS'
                      ? 'bg-amber-500/20 text-amber-400'
                      : reward.reward_type === 'DEPOSIT_COMMISSION'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-purple-500/20 text-purple-400'
                  }`}>
                    {reward.reward_type === 'SIGNUP_BONUS' && <Gift className="w-3.5 h-3.5" />}
                    {reward.reward_type === 'DEPOSIT_COMMISSION' && <Wallet className="w-3.5 h-3.5" />}
                    {reward.reward_type === 'PRIZE_COMMISSION' && <Award className="w-3.5 h-3.5" />}
                  </div>

                  <div className="overflow-hidden">
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {reward.description}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono">
                      {new Date(reward.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {reward.source_event}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 font-black text-xs text-amber-400 font-mono">
                  +{reward.reward_coins} 🪙
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Link Referrer / Enter Code Card (if user not yet linked) */}
      <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-2">
        <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Gift className="w-3.5 h-3.5 text-amber-400" />
          Were You Invited by a Friend?
        </span>

        {stats?.referred_by ? (
          <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Linked to Referrer: <strong>{stats.referred_by.first_name}</strong> (@{stats.referred_by.username})</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
              Active
            </span>
          </div>
        ) : (
          <form onSubmit={handleApplyCode} className="space-y-2">
            <p className="text-[11px] text-slate-400">
              Enter their referral code (e.g. <code className="text-blue-400">ref_7770002</code>) to receive your instant <strong>50 Bonus Coins</strong> welcome reward!
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. ref_7770002"
                value={applyCodeInput}
                onChange={(e) => setApplyCodeInput(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 outline-none focus:border-blue-500 transition"
              />
              <button
                type="submit"
                disabled={isApplying || !applyCodeInput.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs transition active:scale-95"
              >
                {isApplying ? 'Applying...' : 'Apply Code'}
              </button>
            </div>

            {applyMessage && (
              <div className={`p-2 rounded-xl text-xs font-medium ${
                applyMessage.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-500/40 text-rose-300'
              }`}>
                {applyMessage.text}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
