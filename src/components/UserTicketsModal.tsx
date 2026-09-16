import React, { useState, useEffect, useCallback } from 'react';
import { Ticket, Trophy, RefreshCw, CheckCircle2, Clock, Sparkles, X } from 'lucide-react';
import { LotteryTicket } from '../types';
import { apiFetch } from '../utils/api';

interface UserTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramUserId: number;
}

export function UserTicketsModal({
  isOpen,
  onClose,
  telegramUserId,
}: UserTicketsModalProps) {
  const [tickets, setTickets] = useState<LotteryTicket[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'WON'>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<LotteryTicket[]>('/api/v1/lottery/my-tickets', {
        headers: {
          'x-telegram-user-id': telegramUserId.toString(),
        },
      });
      if (data.success && Array.isArray(data.data)) {
        setTickets(data.data);
      }
    } catch (err) {
      console.warn('Could not fetch tickets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [telegramUserId]);

  useEffect(() => {
    if (isOpen) {
      fetchTickets();
    }
  }, [isOpen, fetchTickets]);

  if (!isOpen) return null;

  const filteredTickets = tickets.filter((t) => {
    if (filter === 'ACTIVE') return t.draw_status === 'OPEN';
    if (filter === 'WON') return (t.payout_won ?? 0) > 0;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white text-base">My Lottery Tickets</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 text-xs border-b border-slate-800/60">
          <div className="flex items-center gap-1.5">
            {(['ALL', 'ACTIVE', 'WON'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  filter === mode
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
                }`}
              >
                {mode === 'ALL' ? 'All' : mode === 'ACTIVE' ? 'Pending' : 'Winning'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={fetchTickets}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Tickets List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {filteredTickets.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500 space-y-2">
              <Ticket className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
              <p>No tickets found under this filter.</p>
            </div>
          ) : (
            filteredTickets.map((t) => {
              const isWon = (t.payout_won ?? 0) > 0;
              const isCompleted = t.draw_status === 'COMPLETED';

              return (
                <div
                  key={t.ticket_id}
                  className={`p-3 rounded-xl border text-xs space-y-2 transition ${
                    isWon
                      ? 'bg-emerald-950/30 border-emerald-500/40'
                      : 'bg-slate-950/80 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-extrabold text-white text-sm">{t.draw_title}</div>
                      <div className="text-[10px] text-slate-500">
                        Purchased: {new Date(t.purchase_time).toLocaleDateString()} {new Date(t.purchase_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        isWon
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isCompleted
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {isWon ? 'WON' : isCompleted ? 'NO WIN' : 'PENDING DRAW'}
                    </span>
                  </div>

                  {/* Picked numbers */}
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="text-[11px] text-slate-400">Your Numbers:</span>
                    {t.selected_numbers.map((n) => {
                      const isMatch = t.winning_numbers?.includes(n);
                      return (
                        <span
                          key={n}
                          className={`w-6 h-6 rounded-full font-black text-[11px] flex items-center justify-center ${
                            isMatch
                              ? 'bg-amber-400 text-slate-950 font-black shadow-sm ring-2 ring-amber-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {n}
                        </span>
                      );
                    })}
                  </div>

                  {/* Outcome details if completed */}
                  {isCompleted && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1 text-slate-400">
                        <span>Winning balls:</span>
                        <span className="font-mono text-slate-200">
                          {t.winning_numbers?.join(', ')}
                        </span>
                      </div>
                      {isWon && (
                        <span className="font-extrabold text-emerald-400 flex items-center gap-1">
                          <Trophy className="w-3 h-3 text-amber-400" />
                          <span>+{t.payout_won} {t.currency}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
