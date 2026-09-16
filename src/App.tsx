import React, { useState, useEffect, useCallback } from 'react';
import { Dices, Award, Ticket, ShieldCheck, HelpCircle, Users, Gift } from 'lucide-react';
import { HeaderNav } from './components/HeaderNav';
import { SpinnerWheel } from './components/SpinnerWheel';
import { ScheduledLottery } from './components/ScheduledLottery';
import { ProvablyFairAudit } from './components/ProvablyFairAudit';
import { UserTicketsModal } from './components/UserTicketsModal';
import { AdminDashboard } from './components/AdminDashboard';
import { ReferralCenter } from './components/ReferralCenter';
import { DepositModal } from './components/DepositModal';
import { UserProfile, UserBalances } from './types';
import { apiFetch } from './utils/api';

type ActiveTab = 'SPINNER' | 'LOTTERY' | 'REFERRAL' | 'AUDIT';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('SPINNER');
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const [telegramUserId, setTelegramUserId] = useState<number>(7770001);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [balances, setBalances] = useState<UserBalances>({
    coins: 200,
    stars: 20,
    free_tickets: 3,
  });
  const [initData, setInitData] = useState<string>('');
  const [isTicketsModalOpen, setIsTicketsModalOpen] = useState<boolean>(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState<boolean>(false);

  // Verification pre-fill state
  const [auditParams, setAuditParams] = useState<{
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }>({
    serverSeed: '',
    clientSeed: '',
    nonce: 0,
  });

  // Fetch or resolve Telegram User
  const authenticateUser = useCallback(async (userId: number) => {
    try {
      // Check if Telegram WebApp exists
      const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } }).Telegram?.WebApp;
      if (tg?.ready) {
        tg.ready();
        tg.expand?.();
      }

      const rawInitData = tg?.initData || '';
      setInitData(rawInitData);

      const json = await apiFetch<UserProfile>('/api/v1/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: rawInitData ? `Bearer ${rawInitData}` : '',
          'x-telegram-user-id': userId.toString(),
        },
      });

      if (json.success && json.data) {
        setUser(json.data);
        if (json.data.balances) {
          setBalances(json.data.balances);
        }
      }
    } catch (err) {
      console.warn('Authentication status:', err);
    }
  }, []);

  useEffect(() => {
    authenticateUser(telegramUserId);
  }, [telegramUserId, authenticateUser]);

  const handleSwitchUser = (newId: number) => {
    setTelegramUserId(newId);
  };

  const handleNavigateToVerifier = (serverSeed: string, clientSeed: string, nonce: number) => {
    setAuditParams({ serverSeed, clientSeed, nonce });
    setActiveTab('AUDIT');
  };

  if (isAdminView) {
    return (
      <AdminDashboard
        onBackToApp={() => setIsAdminView(false)}
        onRefreshUserData={() => authenticateUser(telegramUserId)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Top Telegram Header & Balances */}
      <HeaderNav
        user={user}
        balances={balances}
        onBalanceUpdate={setBalances}
        telegramUserId={telegramUserId}
        onSwitchUser={handleSwitchUser}
        onOpenAdmin={() => setIsAdminView(true)}
        onOpenDeposit={() => setIsDepositModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-2 pb-20">
        {activeTab === 'SPINNER' && (
          <SpinnerWheel
            initData={initData}
            balances={balances}
            onBalanceUpdate={setBalances}
            onNavigateToVerifier={handleNavigateToVerifier}
            telegramUserId={telegramUserId}
          />
        )}

        {activeTab === 'LOTTERY' && (
          <ScheduledLottery
            balances={balances}
            onBalanceUpdate={setBalances}
            telegramUserId={telegramUserId}
            onViewMyTickets={() => setIsTicketsModalOpen(true)}
          />
        )}

        {activeTab === 'REFERRAL' && (
          <ReferralCenter
            telegramUserId={telegramUserId}
            balances={balances}
            onBalanceUpdate={setBalances}
            onOpenDeposit={() => setIsDepositModalOpen(true)}
          />
        )}

        {activeTab === 'AUDIT' && (
          <ProvablyFairAudit
            initialServerSeed={auditParams.serverSeed}
            initialClientSeed={auditParams.clientSeed}
            initialNonce={auditParams.nonce}
            telegramUserId={telegramUserId}
          />
        )}
      </main>

      {/* Tickets Modal */}
      <UserTicketsModal
        isOpen={isTicketsModalOpen}
        onClose={() => setIsTicketsModalOpen(false)}
        telegramUserId={telegramUserId}
      />

      {/* Deposit Modal */}
      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        telegramUserId={telegramUserId}
        onSuccess={setBalances}
      />

      {/* Telegram Mini App Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          {/* Spinner Tab */}
          <button
            type="button"
            id="tab-spinner"
            onClick={() => setActiveTab('SPINNER')}
            className={`flex flex-col items-center justify-center gap-1 transition relative ${
              activeTab === 'SPINNER' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Dices className="w-5 h-5" />
            <span className="text-[10px]">Wheel</span>
            {activeTab === 'SPINNER' && (
              <span className="absolute bottom-1 w-6 h-1 rounded-full bg-blue-500" />
            )}
          </button>

          {/* Lottery Tab */}
          <button
            type="button"
            id="tab-lottery"
            onClick={() => setActiveTab('LOTTERY')}
            className={`flex flex-col items-center justify-center gap-1 transition relative ${
              activeTab === 'LOTTERY' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-5 h-5" />
            <span className="text-[10px]">Lottery</span>
            {activeTab === 'LOTTERY' && (
              <span className="absolute bottom-1 w-6 h-1 rounded-full bg-amber-400" />
            )}
          </button>

          {/* Referral & 10% Earn Tab */}
          <button
            type="button"
            id="tab-referrals"
            onClick={() => setActiveTab('REFERRAL')}
            className={`flex flex-col items-center justify-center gap-1 transition relative ${
              activeTab === 'REFERRAL' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Users className="w-5 h-5" />
              <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full bg-amber-500 text-slate-950 font-black text-[8px] leading-tight">
                10%
              </span>
            </div>
            <span className="text-[10px]">Referrals</span>
            {activeTab === 'REFERRAL' && (
              <span className="absolute bottom-1 w-6 h-1 rounded-full bg-emerald-400" />
            )}
          </button>

          {/* My Tickets Button */}
          <button
            type="button"
            id="tab-tickets"
            onClick={() => setIsTicketsModalOpen(true)}
            className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-200 transition"
          >
            <Ticket className="w-5 h-5" />
            <span className="text-[10px]">Tickets</span>
          </button>

          {/* Audit Tab */}
          <button
            type="button"
            id="tab-audit"
            onClick={() => setActiveTab('AUDIT')}
            className={`flex flex-col items-center justify-center gap-1 transition relative ${
              activeTab === 'AUDIT' ? 'text-purple-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[10px]">Fairness</span>
            {activeTab === 'AUDIT' && (
              <span className="absolute bottom-1 w-6 h-1 rounded-full bg-purple-400" />
            )}
          </button>
        </div>
      </nav>
    </div>
  );
}
