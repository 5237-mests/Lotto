import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Award,
  Dices,
  Users,
  ShieldCheck,
  DollarSign,
  Play,
  RotateCcw,
  RefreshCw,
  Plus,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Search,
  Sliders,
  TrendingUp,
  Ban,
  ArrowUpRight,
  FileText,
  Clock,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  ArrowLeft
} from 'lucide-react';
import {
  AdminRole,
  AdminUser,
  AdminAuditLog,
  WithdrawalRequest,
  AdminDashboardMetrics,
  AdminUserRecord,
  RtpSimulationResult,
  SpinnerSector,
  LotteryDraw
} from '../types';
import { apiFetch } from '../utils/api';

interface AdminDashboardProps {
  onBackToApp: () => void;
  onRefreshUserData?: () => void;
}

type AdminTab = 'OVERVIEW' | 'LOTTERY' | 'SPINNER' | 'USERS' | 'AUDIT' | 'WITHDRAWALS';

export function AdminDashboard({ onBackToApp, onRefreshUserData }: AdminDashboardProps) {
  // Active RBAC Role (Defaults to Super Admin)
  const [currentRole, setCurrentRole] = useState<AdminRole>('SUPER_ADMIN');
  const [activeTab, setActiveTab] = useState<AdminTab>('OVERVIEW');
  const [loading, setLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Data Stores
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [draws, setDraws] = useState<any[]>([]);
  const [sectors, setSectors] = useState<SpinnerSector[]>([]);
  const [usersList, setUsersList] = useState<AdminUserRecord[]>([]);
  const [userSearch, setUserSearch] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [simulationResult, setSimulationResult] = useState<RtpSimulationResult | null>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  // Modals & Sub-forms
  const [isCreateDrawOpen, setIsCreateDrawOpen] = useState<boolean>(false);
  const [newDrawForm, setNewDrawForm] = useState({
    title: 'Weekly TON High-Roller',
    ticket_price: 20,
    currency: 'COINS',
    payout_pool: 2500,
    draw_time_minutes: 60
  });

  const [selectedUserForAdjustment, setSelectedUserForAdjustment] = useState<AdminUserRecord | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    currency: 'COINS',
    amount: 50,
    operation: 'ADD',
    memo: 'Promotional loyalty reward'
  });

  // Seed Audit Inspector State
  const [auditInspector, setAuditInspector] = useState({
    type: 'SPINNER',
    server_seed: '',
    client_seed: '',
    nonce: 0,
    result: null as any
  });

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Common fetch wrapper passing selected RBAC role in headers
  const adminApi = useCallback(
    async <T,>(endpoint: string, options: RequestInit = {}): Promise<{ success: boolean; data?: T; error?: string; message?: string }> => {
      const headers = {
        'Content-Type': 'application/json',
        'x-admin-role': currentRole,
        Authorization: `Bearer mock_jwt_${currentRole.toLowerCase()}`,
        ...(options.headers || {})
      };
      return apiFetch<T>(endpoint, { ...options, headers });
    },
    [currentRole]
  );

  // Initial Data Fetch
  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, dRes, sRes, uRes, aRes, wRes, anomRes] = await Promise.all([
        adminApi<AdminDashboardMetrics>('/api/v1/admin/metrics'),
        adminApi<any[]>('/api/v1/admin/draws'),
        adminApi<{ sectors: SpinnerSector[]; simulation: RtpSimulationResult }>('/api/v1/admin/spinner/sectors'),
        adminApi<AdminUserRecord[]>('/api/v1/admin/users'),
        adminApi<AdminAuditLog[]>('/api/v1/admin/audit/logs'),
        adminApi<WithdrawalRequest[]>('/api/v1/admin/withdrawals'),
        adminApi<any[]>('/api/v1/admin/audit/anomalies')
      ]);

      if (mRes.success && mRes.data) setMetrics(mRes.data);
      if (dRes.success && dRes.data) setDraws(dRes.data);
      if (sRes.success && sRes.data) {
        setSectors(sRes.data.sectors || []);
        if (sRes.data.simulation) setSimulationResult(sRes.data.simulation);
      }
      if (uRes.success && uRes.data) setUsersList(uRes.data);
      if (aRes.success && aRes.data) setAuditLogs(aRes.data);
      if (wRes.success && wRes.data) setWithdrawals(wRes.data);
      if (anomRes.success && anomRes.data) setAnomalies(anomRes.data);
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [adminApi]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, currentRole]);

  // =========================================================================
  // ACTIONS: LOTTERY OPERATIONS
  // =========================================================================
  const handleCreateDraw = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminApi('/api/v1/admin/draws', {
        method: 'POST',
        body: JSON.stringify(newDrawForm)
      });
      if (res.success) {
        showToast(res.message || 'New lottery draw created successfully!');
        setIsCreateDrawOpen(false);
        loadDashboardData();
      } else {
        showToast(res.error || 'Failed to create draw', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error creating draw', 'error');
    }
  };

  const handleToggleDrawStatus = async (drawId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'OPEN' ? 'LOCKED' : 'OPEN';
    try {
      const res = await adminApi(`/api/v1/admin/draws/${drawId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.success) {
        showToast(`Draw ${drawId} is now ${nextStatus}`);
        loadDashboardData();
      } else {
        showToast(res.error || 'Failed to update status', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Action error', 'error');
    }
  };

  const handleForceExecuteDraw = async (drawId: string) => {
    if (!window.confirm(`Force immediate execution of draw ${drawId}? Winning numbers will be generated and prizes distributed.`)) {
      return;
    }
    try {
      const res = await adminApi<{ winning_numbers: number[]; total_payout: number }>(`/api/v1/admin/draws/${drawId}/execute`, {
        method: 'POST'
      });
      if (res.success && res.data) {
        showToast(`Draw resolved! Winning balls: [${res.data.winning_numbers.join(', ')}]. Paid out ${res.data.total_payout} coins.`);
        loadDashboardData();
        onRefreshUserData?.();
      } else {
        showToast(res.error || 'Force draw failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Force draw failed', 'error');
    }
  };

  const handleCancelAndRefundDraw = async (drawId: string) => {
    const memo = prompt('Enter mandatory cancellation memo / reason:');
    if (!memo) return;
    try {
      const res = await adminApi(`/api/v1/admin/draws/${drawId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ memo })
      });
      if (res.success) {
        showToast(res.message || 'Draw cancelled and tickets refunded.');
        loadDashboardData();
        onRefreshUserData?.();
      } else {
        showToast(res.error || 'Cancellation failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Action error', 'error');
    }
  };

  // =========================================================================
  // ACTIONS: SPINNER MANAGEMENT & SIMULATOR
  // =========================================================================
  const handleSectorWeightChange = (index: number, weight: number) => {
    const updated = [...sectors];
    updated[index] = { ...updated[index], weight: Math.max(1, weight) };
    setSectors(updated);
  };

  const handleSectorValueChange = (index: number, value: number) => {
    const updated = [...sectors];
    updated[index] = { ...updated[index], prize_value: Math.max(0, value) };
    setSectors(updated);
  };

  const handleSectorLabelChange = (index: number, label: string) => {
    const updated = [...sectors];
    updated[index] = { ...updated[index], label };
    setSectors(updated);
  };

  const handleSectorPrizeTypeChange = (index: number, prize_type: any) => {
    const updated = [...sectors];
    updated[index] = { ...updated[index], prize_type };
    setSectors(updated);
  };

  const handleRunSimulation = async (iterations = 1000000) => {
    setSimulating(true);
    try {
      const res = await adminApi<RtpSimulationResult>('/api/v1/admin/spinner/simulate-rtp', {
        method: 'POST',
        body: JSON.stringify({ sectors, iterations })
      });
      if (res.success && res.data) {
        setSimulationResult(res.data);
        showToast(`Monte Carlo simulation (${iterations.toLocaleString()} spins) finished. RTP: ${res.data.simulated_rtp}`);
      } else {
        showToast(res.error || 'Simulation failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Simulation error', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const handleSaveSpinnerConfig = async () => {
    try {
      const res = await adminApi('/api/v1/admin/spinner/sectors', {
        method: 'PUT',
        body: JSON.stringify({ sectors })
      });
      if (res.success) {
        showToast(res.message || 'Spinner sector weights saved and deployed live!');
        loadDashboardData();
      } else {
        showToast(res.error || 'Failed to update sectors', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save configuration', 'error');
    }
  };

  // =========================================================================
  // ACTIONS: USER MANAGEMENT & LEDGER
  // =========================================================================
  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForAdjustment) return;
    try {
      const res = await adminApi(`/api/v1/admin/users/${selectedUserForAdjustment.telegram_id}/adjust-balance`, {
        method: 'POST',
        body: JSON.stringify(adjustForm)
      });
      if (res.success) {
        showToast(res.message || 'User balance updated successfully!');
        setSelectedUserForAdjustment(null);
        loadDashboardData();
        onRefreshUserData?.();
      } else {
        showToast(res.error || 'Failed to adjust balance', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating user balance', 'error');
    }
  };

  const handleToggleUserBan = async (user: AdminUserRecord) => {
    const actionName = user.is_banned ? 'Unban' : 'Ban';
    if (!window.confirm(`${actionName} player @${user.username || user.telegram_id}?`)) return;
    try {
      const res = await adminApi(`/api/v1/admin/users/${user.telegram_id}/toggle-ban`, {
        method: 'POST',
        body: JSON.stringify({ memo: `Manual ${actionName} by admin` })
      });
      if (res.success) {
        showToast(res.message || 'User status toggled');
        loadDashboardData();
      } else {
        showToast(res.error || 'Failed to toggle ban status', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Action error', 'error');
    }
  };

  // =========================================================================
  // ACTIONS: WITHDRAWALS
  // =========================================================================
  const handleProcessWithdrawal = async (requestId: string, action: 'APPROVED' | 'REJECTED' | 'PROCESSED') => {
    const notes = prompt(`Enter optional review notes for ${action}:`) || '';
    try {
      const res = await adminApi(`/api/v1/admin/withdrawals/${requestId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, notes })
      });
      if (res.success) {
        showToast(`Withdrawal request marked as ${action}`);
        loadDashboardData();
      } else {
        showToast(res.error || 'Action failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Action error', 'error');
    }
  };

  // =========================================================================
  // ACTIONS: SEED AUDIT
  // =========================================================================
  const handleVerifySeedAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminApi('/api/v1/admin/audit/verify-seed', {
        method: 'POST',
        body: JSON.stringify({
          type: auditInspector.type,
          server_seed: auditInspector.server_seed,
          client_seed: auditInspector.client_seed,
          nonce: auditInspector.nonce
        })
      });
      if (res.success && res.data) {
        setAuditInspector((prev) => ({ ...prev, result: res.data }));
        showToast('Cryptographic seed verification complete: VALID outcome confirmed.');
      } else {
        showToast(res.error || 'Verification failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Verification error', 'error');
    }
  };

  // Helper for win % calculations in Sector Editor
  const totalSectorsWeight = sectors.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Toast Alert */}
      {actionMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl border text-sm font-semibold flex items-center gap-2 animate-in slide-in-from-top-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/95 border-rose-500/50 text-rose-300'
          }`}
        >
          {actionMessage.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* TOP ADMIN HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="admin-btn-back-app"
              onClick={onBackToApp}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
              title="Return to Player TMA interface"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App</span>
            </button>
            <div className="h-6 w-px bg-slate-800 hidden sm:block" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base text-white tracking-tight">Platform Admin Gateway</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  v1.2 Compliance
                </span>
              </div>
              <div className="text-[11px] text-slate-400">Telegram Lottery & Wheel of Fortune Orchestrator</div>
            </div>
          </div>

          {/* Right Control Strip: Role Switcher & System Status */}
          <div className="flex items-center gap-3">
            {/* System Status indicator */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>MySQL & HMAC Engine Active</span>
            </div>

            {/* RBAC Role Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Role:</span>
              <select
                id="admin-role-select"
                value={currentRole}
                onChange={(e) => setCurrentRole(e.target.value as AdminRole)}
                className="bg-transparent text-xs font-bold text-amber-300 focus:outline-none cursor-pointer"
              >
                <option value="SUPER_ADMIN" className="bg-slate-900 text-amber-400">Super Admin</option>
                <option value="LOTTERY_MANAGER" className="bg-slate-900 text-blue-400">Lottery Manager</option>
                <option value="FINANCE_OFFICER" className="bg-slate-900 text-emerald-400">Finance Officer</option>
                <option value="SUPPORT" className="bg-slate-900 text-purple-400">Support Specialist</option>
              </select>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              id="admin-btn-refresh"
              onClick={loadDashboardData}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-50"
              title="Refresh all metrics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* SUB-NAVIGATION TABS */}
        <div className="max-w-7xl mx-auto px-4 border-t border-slate-800/80">
          <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-none text-xs">
            <button
              type="button"
              id="admin-tab-overview"
              onClick={() => setActiveTab('OVERVIEW')}
              className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'OVERVIEW' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>KPI Overview</span>
            </button>

            <button
              type="button"
              id="admin-tab-lottery"
              onClick={() => setActiveTab('LOTTERY')}
              className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'LOTTERY' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>Lottery Draws</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/70 text-amber-300">
                {draws.filter((d) => d.status === 'OPEN').length}
              </span>
            </button>

            <button
              type="button"
              id="admin-tab-spinner"
              onClick={() => setActiveTab('SPINNER')}
              className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'SPINNER' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Spinner & 1M RTP Simulator</span>
            </button>

            <button
              type="button"
              id="admin-tab-users"
              onClick={() => setActiveTab('USERS')}
              className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'USERS' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>User Ledger & Balances</span>
            </button>

            <button
              type="button"
              id="admin-tab-withdrawals"
              onClick={() => setActiveTab('WITHDRAWALS')}
              className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'WITHDRAWALS' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Financial Queue</span>
              {withdrawals.filter((w) => w.status === 'PENDING').length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                  {withdrawals.filter((w) => w.status === 'PENDING').length}
                </span>
              )}
            </button>

            <button
              type="button"
              id="admin-tab-audit"
              onClick={() => setActiveTab('AUDIT')}
              className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'AUDIT' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Anti-Fraud & Audit</span>
              {anomalies.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-bold">
                  {anomalies.length}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* MAIN ADMIN CONTENT CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* =========================================================================
            MODULE 1: SUMMARY DASHBOARD METRICS (KPIS)
            ========================================================================= */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-6">
            {/* Top KPI Bento Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: GGR */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Gross Gaming Revenue (GGR)</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">
                    {metrics?.financials.ggr ? (metrics.financials.ggr >= 0 ? `+${metrics.financials.ggr}` : metrics.financials.ggr) : '+0.00'}
                  </span>
                  <span className="text-xs font-bold text-slate-400">Coins</span>
                </div>
                <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Margin: {metrics?.financials.profit_margin_pct ?? 0}% of turnover</span>
                </div>
                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
              </div>

              {/* Card 2: Active Draw Pool */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Active Scheduled Draw Pool</span>
                  <Award className="w-4 h-4 text-amber-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-amber-400">
                    {metrics?.lottery_analytics.active_draw_pool.toLocaleString() ?? '0'}
                  </span>
                  <span className="text-xs font-bold text-slate-400">Coins</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
                  <span>Across {metrics?.lottery_analytics.open_draws ?? 0} active lotteries</span>
                </div>
                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
              </div>

              {/* Card 3: Spinner House Margin */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Spinner House Margin</span>
                  <Sliders className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-cyan-300">
                    {metrics?.spinner_analytics.house_margin ?? '15.5%'}
                  </span>
                  <span className="text-xs text-slate-400">(RTP: {metrics?.spinner_analytics.actual_rtp ?? '84.5%'})</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  Theoretical: {metrics?.spinner_analytics.theoretical_rtp ?? '84.5%'}
                </div>
                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-cyan-500/5 rounded-full blur-xl pointer-events-none" />
              </div>

              {/* Card 4: DAU / MAU */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Mini App Players (DAU / MAU)</span>
                  <Users className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">
                    {metrics?.users.dau_estimate ?? 1}
                  </span>
                  <span className="text-xs text-slate-400">/ {metrics?.users.mau_estimate ?? 5} MAU</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  {metrics?.users.total_registered ?? 0} registered â€¢ {metrics?.users.banned_users ?? 0} banned
                </div>
                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
              </div>
            </div>

            {/* Quick Actions & High-Level Pulse */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Financial Pulse */}
              <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                    <h3 className="font-bold text-sm text-white">Platform Turnover & Payout Distribution</h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">Real-time ledger sync</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[11px] text-slate-400">Total Wagered Turnover</div>
                    <div className="text-lg font-bold text-white mt-1">
                      {metrics?.financials.total_turnover.toLocaleString() ?? '0'} Coins
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[11px] text-slate-400">Prizes Distributed</div>
                    <div className="text-lg font-bold text-emerald-400 mt-1">
                      {metrics?.financials.total_payouts_paid.toLocaleString() ?? '0'} Coins
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[11px] text-slate-400">Pending Withdrawals</div>
                    <div className="text-lg font-bold text-amber-400 mt-1">
                      {metrics?.financial_queue.pending_withdrawals ?? 0} Requests
                    </div>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('LOTTERY')}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Create New Lottery</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('SPINNER')}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Tune Sector Weights</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('WITHDRAWALS')}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition flex items-center gap-1.5"
                  >
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Review Pending Payouts</span>
                  </button>
                </div>
              </div>

              {/* Anomaly Detection Alerts Feed */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h3 className="font-bold text-sm text-white">Anti-Fraud Monitor</h3>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                    {anomalies.length} Flagged
                  </span>
                </div>

                {anomalies.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500/50 mb-2" />
                    No suspicious bot patterns or jackpot spikes detected in recent rounds.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {anomalies.map((anom) => (
                      <div key={anom.id} className="p-2.5 rounded-xl bg-slate-950 border border-amber-500/30 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-300">{anom.reason}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-mono">
                            {anom.severity}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-1">{anom.details}</div>
                        <div className="text-[10px] text-slate-400 mt-1">Player: @{anom.username} (#{anom.telegram_id})</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Live Audit Log Preview */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-400" />
                  <h3 className="font-bold text-sm text-white">Recent Immutable Administrative Audit Logs</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('AUDIT')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <span>View All Logs</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Admin</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Target Resource</th>
                      <th className="py-2.5 px-3">Payload Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {auditLogs.slice(0, 5).map((log) => (
                      <tr key={log.log_id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2.5 px-3 font-bold text-amber-400">@{log.admin_username}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">{log.target_resource}</td>
                        <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">
                          {JSON.stringify(log.payload)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODULE 2: SCHEDULED LOTTERY DRAW MANAGEMENT (SECTION 2.1)
            ========================================================================= */}
        {activeTab === 'LOTTERY' && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">Scheduled Lottery Draws & Lifecycle Orchestrator</h2>
                <p className="text-xs text-slate-400">Create, lock, execute force draws, or cancel with automatic refund.</p>
              </div>

              <button
                type="button"
                id="admin-btn-open-create-draw"
                onClick={() => setIsCreateDrawOpen(true)}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-600/20 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Schedule New Draw</span>
              </button>
            </div>

            {/* Modal: Create Draw */}
            {isCreateDrawOpen && (
              <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-base text-white">Create New Scheduled Lottery Draw</h3>
                    <button
                      type="button"
                      onClick={() => setIsCreateDrawOpen(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateDraw} className="space-y-4 text-xs">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Draw Title</label>
                      <input
                        type="text"
                        required
                        value={newDrawForm.title}
                        onChange={(e) => setNewDrawForm({ ...newDrawForm, title: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Ticket Price</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={newDrawForm.ticket_price}
                          onChange={(e) => setNewDrawForm({ ...newDrawForm, ticket_price: Number(e.target.value) })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Currency</label>
                        <select
                          value={newDrawForm.currency}
                          onChange={(e) => setNewDrawForm({ ...newDrawForm, currency: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold focus:outline-none focus:border-amber-500"
                        >
                          <option value="COINS">Coins</option>
                          <option value="STARS">Telegram Stars</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Initial Payout Pool</label>
                        <input
                          type="number"
                          min="100"
                          required
                          value={newDrawForm.payout_pool}
                          onChange={(e) => setNewDrawForm({ ...newDrawForm, payout_pool: Number(e.target.value) })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Draw In (Minutes)</label>
                        <input
                          type="number"
                          min="5"
                          required
                          value={newDrawForm.draw_time_minutes}
                          onChange={(e) => setNewDrawForm({ ...newDrawForm, draw_time_minutes: Number(e.target.value) })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                      <div className="font-bold text-slate-300">Multi-Tier Prize Rules:</div>
                      <div>â€¢ Match 5/5: 70% of Jackpot Pool</div>
                      <div>â€¢ Match 4/5: 20% of Jackpot Pool</div>
                      <div>â€¢ Match 3/5: 8% of Jackpot Pool</div>
                      <div>â€¢ Match 2/5: 1.5x Ticket Cost</div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsCreateDrawOpen(false)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-md"
                      >
                        Publish & Open Draw
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Draws Table */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-[11px] text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Title & ID</th>
                      <th className="py-3 px-4">Price / Currency</th>
                      <th className="py-3 px-4">Payout Pool</th>
                      <th className="py-3 px-4">Tickets Sold</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Winning Numbers</th>
                      <th className="py-3 px-4 text-right">Lifecycle Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {draws.map((d) => {
                      const isOpen = d.status === 'OPEN';
                      const isLocked = d.status === 'LOCKED';
                      const isCompleted = d.status === 'COMPLETED';

                      return (
                        <tr key={d.draw_id} className="hover:bg-slate-800/30">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white text-sm">{d.title}</div>
                            <div className="font-mono text-[10px] text-slate-400">{d.draw_id}</div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold">
                            {d.ticket_price} {d.currency}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-black text-amber-400 text-sm">
                              {Number(d.payout_pool).toLocaleString()}
                            </span>{' '}
                            <span className="text-[10px] text-slate-400">{d.currency}</span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-white">
                            {d.purchased_tickets ?? d.ticket_count ?? 0}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                isOpen
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : isLocked
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : isCompleted
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold">
                            {d.winning_numbers ? (
                              <div className="flex items-center gap-1">
                                {d.winning_numbers.map((n: number) => (
                                  <span
                                    key={n}
                                    className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-[11px]"
                                  >
                                    {n}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Pending Draw</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Open / Lock toggle */}
                              {(isOpen || isLocked) && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleDrawStatus(d.draw_id, d.status)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                  title={isOpen ? 'Lock ticket purchases' : 'Unlock ticket purchases'}
                                >
                                  {isOpen ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
                                </button>
                              )}

                              {/* Force Draw Button */}
                              {!isCompleted && d.status !== 'CANCELLED' && (
                                <button
                                  type="button"
                                  onClick={() => handleForceExecuteDraw(d.draw_id)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow transition"
                                  title="Force immediate outcome calculation"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>Force Draw</span>
                                </button>
                              )}

                              {/* Cancel & Refund */}
                              {!isCompleted && d.status !== 'CANCELLED' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelAndRefundDraw(d.draw_id)}
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 transition"
                                  title="Cancel draw & refund all purchased tickets"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODULE 3: INSTANT SPINNER MANAGEMENT ENGINE & 1M RTP SIMULATOR (SECTION 2.2)
            ========================================================================= */}
        {activeTab === 'SPINNER' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">Instant Wheel Sector Weights & Monte Carlo RTP Engine</h2>
                <p className="text-xs text-slate-400">
                  Tune prize weights and run up to 1,000,000 simulated spins before deploying changes to live users.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="admin-btn-sim-100k"
                  disabled={simulating}
                  onClick={() => handleRunSimulation(100000)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition disabled:opacity-50"
                >
                  Simulate 100K Spins
                </button>
                <button
                  type="button"
                  id="admin-btn-sim-1m"
                  disabled={simulating}
                  onClick={() => handleRunSimulation(1000000)}
                  className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-600/20 transition disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{simulating ? 'Simulating...' : 'Run 1,000,000 Monte Carlo Spins'}</span>
                </button>
                <button
                  type="button"
                  id="admin-btn-save-sectors"
                  onClick={handleSaveSpinnerConfig}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 transition"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Publish Live Weights</span>
                </button>
              </div>
            </div>

            {/* Monte Carlo Simulation Outcome Card */}
            {simulationResult && (
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-bold text-sm text-white">
                      Monte Carlo Simulation Results ({simulationResult.iterations.toLocaleString()} Spins Tested)
                    </h3>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      simulationResult.is_house_profitable
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {simulationResult.is_house_profitable ? 'House Profitable (Safe to Deploy)' : 'Danger: Negative House Edge'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[11px] text-slate-400">Theoretical Win RTP</div>
                    <div className="text-lg font-black text-cyan-400 mt-1">{simulationResult.theoretical_rtp}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[11px] text-slate-400">Simulated Empirical RTP</div>
                    <div className="text-lg font-black text-purple-400 mt-1">{simulationResult.simulated_rtp}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[11px] text-slate-400">Calculated House Margin</div>
                    <div className="text-lg font-black text-emerald-400 mt-1">{simulationResult.house_edge}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[11px] text-slate-400">Net Platform Retained</div>
                    <div className="text-lg font-black text-white mt-1">
                      {(simulationResult.total_wagered - simulationResult.total_payout_distributed).toLocaleString()} Coins
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sector Weights Table Editor */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Live Sector Table (Total Weight Sum: {totalSectorsWeight})</span>
                <span className="text-[11px] text-slate-400">
                  Formula: Win % = (Sector Weight / {totalSectorsWeight}) Ã— 100
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-[11px] text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Label</th>
                      <th className="py-3 px-4">Prize Type</th>
                      <th className="py-3 px-4">Prize Value</th>
                      <th className="py-3 px-4">Integer Weight</th>
                      <th className="py-3 px-4">Theoretical Win %</th>
                      <th className="py-3 px-4">1M Hit Frequency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-semibold">
                    {sectors.map((s, idx) => {
                      const prob = totalSectorsWeight > 0 ? ((s.weight / totalSectorsWeight) * 100).toFixed(2) : '0.00';
                      const simHit = simulationResult?.sector_breakdown.find((b) => b.sector_id === s.id);

                      return (
                        <tr key={s.id} className="hover:bg-slate-800/30">
                          <td className="py-3 px-4 font-mono text-slate-400">#{s.id}</td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={s.label}
                              onChange={(e) => handleSectorLabelChange(idx, e.target.value)}
                              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-cyan-500 w-36"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={s.prize_type}
                              onChange={(e) => handleSectorPrizeTypeChange(idx, e.target.value)}
                              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-semibold focus:outline-none"
                            >
                              <option value="NO_WIN">NO_WIN</option>
                              <option value="COINS">COINS</option>
                              <option value="FREE_TICKET">FREE_TICKET</option>
                              <option value="STARS">STARS</option>
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              min="0"
                              value={s.prize_value}
                              onChange={(e) => handleSectorValueChange(idx, Number(e.target.value))}
                              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-cyan-500 w-24"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              min="1"
                              value={s.weight}
                              onChange={(e) => handleSectorWeightChange(idx, Number(e.target.value))}
                              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-cyan-500/40 text-cyan-300 font-black focus:outline-none w-24"
                            />
                          </td>
                          <td className="py-3 px-4 font-black text-cyan-400 font-mono">
                            {prob}%
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {simHit ? `${simHit.empirical_win_rate}% (${simHit.total_hits.toLocaleString()} hits)` : 'â€”'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODULE 4: USER MANAGEMENT & LEDGER CONTROLS (SECTION 2.3)
            ========================================================================= */}
        {activeTab === 'USERS' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">Player Ledger & Account Governance</h2>
                <p className="text-xs text-slate-400">
                  Inspect user wallets, audit historical net P/L, perform manual credits with internal memos, or ban bot accounts.
                </p>
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Telegram ID, Username..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Manual Balance Adjustment Modal */}
            {selectedUserForAdjustment && (
              <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-base text-white">
                      Manual Balance Adjustment: @{selectedUserForAdjustment.username}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSelectedUserForAdjustment(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleAdjustBalance} className="space-y-4 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="text-[11px] text-slate-400">Current Balances:</div>
                      <div className="flex items-center gap-3 font-bold text-white">
                        <span>ðŸª™ {selectedUserForAdjustment.balance_coins} Coins</span>
                        <span>â­ {selectedUserForAdjustment.balance_stars} Stars</span>
                        <span>ðŸŽŸï¸ {selectedUserForAdjustment.free_tickets} Tickets</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Operation</label>
                        <select
                          value={adjustForm.operation}
                          onChange={(e) => setAdjustForm({ ...adjustForm, operation: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none"
                        >
                          <option value="ADD">Credit (Deposit +)</option>
                          <option value="DEDUCT">Debit (Deduct -)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Currency</label>
                        <select
                          value={adjustForm.currency}
                          onChange={(e) => setAdjustForm({ ...adjustForm, currency: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none"
                        >
                          <option value="COINS">Coins</option>
                          <option value="STARS">Telegram Stars</option>
                          <option value="FREE_TICKETS">Free Tickets</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Amount</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={adjustForm.amount}
                        onChange={(e) => setAdjustForm({ ...adjustForm, amount: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">
                        Mandatory Internal Audit Memo <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. VIP promotional gift, disputed round refund"
                        value={adjustForm.memo}
                        onChange={(e) => setAdjustForm({ ...adjustForm, memo: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedUserForAdjustment(null)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md"
                      >
                        Execute Adjustment
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Users Table */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-[11px] text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Player ID & Username</th>
                      <th className="py-3 px-4">Balances (ðŸª™/â­/ðŸŽŸï¸)</th>
                      <th className="py-3 px-4">Total Spent</th>
                      <th className="py-3 px-4">Total Won</th>
                      <th className="py-3 px-4">Net P/L</th>
                      <th className="py-3 px-4">Rounds Played</th>
                      <th className="py-3 px-4">Account Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {usersList
                      .filter((u) => {
                        if (!userSearch) return true;
                        const s = userSearch.toLowerCase();
                        return (
                          u.telegram_id.toString().includes(s) ||
                          (u.username && u.username.toLowerCase().includes(s))
                        );
                      })
                      .map((u) => {
                        const isProfit = u.net_profit >= 0;

                        return (
                          <tr key={u.telegram_id} className="hover:bg-slate-800/30">
                            <td className="py-3 px-4">
                              <div className="font-bold text-white text-sm">@{u.username || 'user'}</div>
                              <div className="font-mono text-[10px] text-slate-400">ID: #{u.telegram_id}</div>
                            </td>
                            <td className="py-3 px-4 font-mono font-bold">
                              <span className="text-white">{u.balance_coins}c</span> /{' '}
                              <span className="text-amber-400">{u.balance_stars}s</span> /{' '}
                              <span className="text-emerald-400">{u.free_tickets}t</span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-400">{u.total_spent}</td>
                            <td className="py-3 px-4 font-mono text-slate-300">{u.total_won}</td>
                            <td className="py-3 px-4 font-mono font-black">
                              <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                                {isProfit ? `+${u.net_profit}` : u.net_profit}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-[11px] text-slate-400">
                              {u.tickets_count} tickets â€¢ {u.spins_count} spins
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  u.is_banned
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                }`}
                              >
                                {u.is_banned ? 'BANNED' : 'ACTIVE'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedUserForAdjustment(u)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-bold text-[11px] transition"
                                >
                                  Adjust Balance
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleUserBan(u)}
                                  className={`p-1.5 rounded-lg border transition ${
                                    u.is_banned
                                      ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                      : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-400'
                                  }`}
                                  title={u.is_banned ? 'Unban user' : 'Ban malicious bot account'}
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODULE 5: FINANCIAL APPROVAL QUEUE / WITHDRAWAL REQUESTS (SECTION 3)
            ========================================================================= */}
        {activeTab === 'WITHDRAWALS' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">Financial Approval Queue & Withdrawal Requests</h2>
                <p className="text-xs text-slate-400">
                  Authorize, process, or reject pending TON / Stars withdrawal transactions with immutable audit records.
                </p>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-[11px] text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Request ID</th>
                      <th className="py-3 px-4">Player</th>
                      <th className="py-3 px-4">Amount / Asset</th>
                      <th className="py-3 px-4">Destination Wallet</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Processed By</th>
                      <th className="py-3 px-4 text-right">Approval Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {withdrawals.map((w) => {
                      const isPending = w.status === 'PENDING';

                      return (
                        <tr key={w.request_id} className="hover:bg-slate-800/30">
                          <td className="py-3 px-4 font-mono font-bold text-slate-400">#{w.request_id}</td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">@{w.username}</div>
                            <div className="text-[10px] text-slate-500 font-mono">ID: #{w.telegram_id}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-black text-white text-sm">{w.amount}</span>{' '}
                            <span className="text-xs font-bold text-amber-400">{w.currency}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                            {w.destination_wallet}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                w.status === 'APPROVED'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : w.status === 'PENDING'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : w.status === 'PROCESSED'
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {w.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[11px] text-slate-400">
                            {w.processed_by ? `@${w.processed_by}` : 'â€”'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isPending ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleProcessWithdrawal(w.request_id, 'APPROVED')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleProcessWithdrawal(w.request_id, 'REJECTED')}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 font-bold text-xs"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : w.status === 'APPROVED' ? (
                              <button
                                type="button"
                                onClick={() => handleProcessWithdrawal(w.request_id, 'PROCESSED')}
                                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
                              >
                                Mark Processed
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500">Archived</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODULE 6: ANTI-FRAUD & PROVABLY FAIR VERIFICATION AUDIT (SECTION 2.4)
            ========================================================================= */}
        {activeTab === 'AUDIT' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">Anti-Fraud & Cryptographic Seed Audit Inspector</h2>
                <p className="text-xs text-slate-400">
                  Inspect any server seed, client seed, or draw hash to verify mathematical integrity and non-tampered outcomes.
                </p>
              </div>
            </div>

            {/* Seed Inspector Form */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-sm text-white">Verify Spin or Draw Outcome</h3>
              </div>

              <form onSubmit={handleVerifySeedAudit} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Game Engine Type</label>
                    <select
                      value={auditInspector.type}
                      onChange={(e) => setAuditInspector({ ...auditInspector, type: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none"
                    >
                      <option value="SPINNER">Instant Wheel Spinner (HMAC-SHA256)</option>
                      <option value="LOTTERY">Scheduled Lottery (5 Winning Balls 1-35)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 font-semibold mb-1">Server Seed (Hexadecimal)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 7c34ef5981a...64-char seed"
                      value={auditInspector.server_seed}
                      onChange={(e) => setAuditInspector({ ...auditInspector, server_seed: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 font-semibold mb-1">Client Seed</label>
                    <input
                      type="text"
                      required
                      placeholder="Client entropy / player seed string"
                      value={auditInspector.client_seed}
                      onChange={(e) => setAuditInspector({ ...auditInspector, client_seed: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Nonce Index</label>
                    <input
                      type="number"
                      min="0"
                      value={auditInspector.nonce}
                      onChange={(e) => setAuditInspector({ ...auditInspector, nonce: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-1.5 shadow transition"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Execute Cryptographic HMAC Proof</span>
                  </button>
                </div>
              </form>

              {auditInspector.result && (
                <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/40 space-y-2 text-xs font-mono">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <CheckCircle className="w-4 h-4" />
                    <span>Cryptographic Integrity Verification Passed: NON-TAMPERED</span>
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-500">Derived Seed Hash: </span>
                    {auditInspector.result.derived_server_seed_hash || auditInspector.result.server_seed_hash}
                  </div>
                  {auditInspector.result.hmac_outcome_hash && (
                    <div className="text-slate-300">
                      <span className="text-slate-500">Outcome HMAC: </span>
                      {auditInspector.result.hmac_outcome_hash}
                    </div>
                  )}
                  {auditInspector.result.winning_sector && (
                    <div className="text-amber-300 font-bold">
                      Sector Result: #{auditInspector.result.winning_index} â€”{' '}
                      {auditInspector.result.winning_sector.label} (Prize: {auditInspector.result.winning_sector.prize_value})
                    </div>
                  )}
                  {auditInspector.result.derived_winning_numbers && (
                    <div className="text-amber-300 font-bold">
                      Winning Numbers Derived: [{auditInspector.result.derived_winning_numbers.join(', ')}]
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Complete Immutable Admin Audit Logs */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-xs text-white">Full Immutable System Audit Trail (admin_audit_logs)</span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">Total: {auditLogs.length} events</span>
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 sticky top-0 text-[11px] text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Log ID</th>
                      <th className="py-2.5 px-3">Admin</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Target</th>
                      <th className="py-2.5 px-3">IP Address</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Payload Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {auditLogs.map((log) => (
                      <tr key={log.log_id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-400">{log.log_id.slice(-8)}</td>
                        <td className="py-2 px-3 font-bold text-amber-400">@{log.admin_username}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-300">{log.target_resource}</td>
                        <td className="py-2 px-3 text-slate-500">{log.ip_address}</td>
                        <td className="py-2 px-3 text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                        <td className="py-2 px-3 text-slate-400 max-w-xs truncate">
                          {JSON.stringify(log.payload)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
