import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, Clock, Ticket, Zap, Award, CheckCircle2, Shuffle, AlertCircle, Play } from 'lucide-react';
import { LotteryDraw, UserBalances } from '../types';

interface ScheduledLotteryProps {
  balances: UserBalances;
  onBalanceUpdate: (balances: UserBalances) => void;
  telegramUserId: number;
  onViewMyTickets: () => void;
}

export function ScheduledLottery({
  balances,
  onBalanceUpdate,
  telegramUserId,
  onViewMyTickets,
}: ScheduledLotteryProps) {
  const [draws, setDraws] = useState<LotteryDraw[]>([]);
  const [selectedDraw, setSelectedDraw] = useState<LotteryDraw | null>(null);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [useFreeTicket, setUseFreeTicket] = useState<boolean>(false);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);
  const [isExecutingDraw, setIsExecutingDraw] = useState<string | null>(null);
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [recentResolution, setRecentResolution] = useState<{
    draw_title: string;
    winning_numbers: number[];
    winners_count: number;
    total_distributed: number;
  } | null>(null);

  const fetchDraws = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/lottery/draws');
      const data = await res.json();
      if (data.success) {
        setDraws(data.data);
        if (!selectedDraw && data.data.length > 0) {
          setSelectedDraw(data.data[0]);
        } else if (selectedDraw) {
          const updated = data.data.find((d: LotteryDraw) => d.draw_id === selectedDraw.draw_id);
          if (updated) setSelectedDraw(updated);
        }
      }
    } catch (err) {
      console.error('Failed to fetch draws:', err);
    }
  }, [selectedDraw]);

  useEffect(() => {
    fetchDraws();
    const interval = setInterval(fetchDraws, 10000);
    return () => clearInterval(interval);
  }, [fetchDraws]);

  // Toggle single number (1-35)
  const toggleNumber = (num: number) => {
    if (selectedNumbers.includes(num)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== num));
    } else {
      if (selectedNumbers.length < 5) {
        setSelectedNumbers([...selectedNumbers, num].sort((a, b) => a - b));
      }
    }
  };

  // Quick Pick 5 random unique numbers
  const quickPick = () => {
    const picked: number[] = [];
    while (picked.length < 5) {
      const r = Math.floor(Math.random() * 35) + 1;
      if (!picked.includes(r)) {
        picked.push(r);
      }
    }
    setSelectedNumbers(picked.sort((a, b) => a - b));
  };

  const clearSelection = () => {
    setSelectedNumbers([]);
  };

  // Buy Ticket Handler
  const handleBuyTicket = async () => {
    if (!selectedDraw) return;
    if (selectedNumbers.length !== 5) {
      setAlertInfo({ type: 'error', message: 'Please select exactly 5 numbers (1-35)' });
      return;
    }

    if (useFreeTicket && balances.free_tickets < 1) {
      setAlertInfo({ type: 'error', message: 'You have no free tickets remaining' });
      return;
    }

    if (!useFreeTicket) {
      if (selectedDraw.currency === 'COINS' && balances.coins < selectedDraw.ticket_price) {
        setAlertInfo({ type: 'error', message: `Insufficient Coins! Need ${selectedDraw.ticket_price} Coins` });
        return;
      }
      if (selectedDraw.currency === 'STARS' && balances.stars < selectedDraw.ticket_price) {
        setAlertInfo({ type: 'error', message: `Insufficient Stars! Need ${selectedDraw.ticket_price} Stars` });
        return;
      }
    }

    setIsPurchasing(true);
    setAlertInfo(null);

    try {
      const res = await fetch('/api/v1/lottery/buy-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-user-id': telegramUserId.toString(),
        },
        body: JSON.stringify({
          draw_id: selectedDraw.draw_id,
          selected_numbers: selectedNumbers,
          use_free_ticket: useFreeTicket && selectedDraw.currency === 'COINS'
        })
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Purchase failed');

      onBalanceUpdate(json.data.balances);
      setAlertInfo({
        type: 'success',
        message: `Ticket purchased! Numbers: [${selectedNumbers.join(', ')}]. Good luck!`
      });

      confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
      clearSelection();
      fetchDraws();
    } catch (err: unknown) {
      setAlertInfo({ type: 'error', message: err instanceof Error ? err.message : 'Purchase failed' });
    } finally {
      setIsPurchasing(false);
    }
  };

  // Trigger Instant Draw Simulation for quick testing
  const handleTriggerDraw = async (drawId: string) => {
    setIsExecutingDraw(drawId);
    setAlertInfo(null);

    try {
      const res = await fetch('/api/v1/lottery/trigger-draw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-user-id': telegramUserId.toString(),
        },
        body: JSON.stringify({ draw_id: drawId })
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Draw execution failed');

      setRecentResolution({
        draw_title: json.data.title,
        winning_numbers: json.data.winning_numbers,
        winners_count: json.data.winners_count,
        total_distributed: json.data.total_distributed
      });

      // Refresh balances and draws
      const authRes = await fetch('/api/v1/auth/telegram', {
        method: 'POST',
        headers: { 'x-telegram-user-id': telegramUserId.toString() }
      });
      const authJson = await authRes.json();
      if (authJson.success) {
        onBalanceUpdate(authJson.data.balances);
      }

      await fetchDraws();

      if (json.data.winners_count > 0) {
        confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
      }
    } catch (err: unknown) {
      setAlertInfo({ type: 'error', message: err instanceof Error ? err.message : 'Failed to execute draw' });
    } finally {
      setIsExecutingDraw(null);
    }
  };

  return (
    <div id="scheduled-lottery-module" className="w-full max-w-md mx-auto space-y-4 pb-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
          <Award className="w-3.5 h-3.5" />
          <span>Provably Fair Scheduled Draws</span>
        </div>
        <h2 className="text-2xl font-black text-slate-100 tracking-tight">Jackpot Lotteries</h2>
        <p className="text-xs text-slate-400">Pick 5 lucky numbers (1 - 35) or hit Lucky Dip</p>
      </div>

      {/* Draw Tabs */}
      <div className="grid grid-cols-3 gap-2 px-1">
        {draws.map((d) => {
          const isSelected = selectedDraw?.draw_id === d.draw_id;
          return (
            <button
              key={d.draw_id}
              type="button"
              onClick={() => setSelectedDraw(d)}
              className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden ${
                isSelected
                  ? 'bg-blue-950/80 border-blue-500 text-white shadow-lg'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="text-[11px] font-bold truncate">{d.title}</div>
              <div className="text-xs font-extrabold text-amber-400 mt-1">
                {d.currency === 'COINS' ? `🪙 ${d.payout_pool}` : `⭐ ${d.payout_pool}`}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                <Ticket className="w-3 h-3 text-slate-500" />
                <span>{d.ticket_count} tickets</span>
              </div>
              {isSelected && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Draw Banner */}
      {selectedDraw && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                ACTIVE LOTTERY DRAW
              </span>
              <h3 className="text-lg font-extrabold text-white">{selectedDraw.title}</h3>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                <span className="flex items-center gap-1 text-amber-400 font-bold">
                  <span>Price:</span>
                  <span>
                    {selectedDraw.currency === 'COINS'
                      ? `${selectedDraw.ticket_price} Coins`
                      : `${selectedDraw.ticket_price} Stars`}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>Draw: {new Date(selectedDraw.draw_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              </div>
            </div>

            {/* Test Simulation Button */}
            <button
              type="button"
              id={`trigger-draw-${selectedDraw.draw_id}`}
              onClick={() => handleTriggerDraw(selectedDraw.draw_id)}
              disabled={isExecutingDraw === selectedDraw.draw_id}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1 shrink-0 transition"
              title="Instantly execute draw for testing without waiting for timer"
            >
              <Play className="w-3 h-3" />
              <span>{isExecutingDraw === selectedDraw.draw_id ? 'Drawing...' : 'Draw Now'}</span>
            </button>
          </div>

          {/* Seed Hash display */}
          <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500 font-mono truncate">
            Seed Hash: {selectedDraw.server_seed_hash}
          </div>
        </div>
      )}

      {/* Number Picker Board */}
      <div className="p-4 bg-slate-900/70 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-200">
            Selected Numbers: ({selectedNumbers.length}/5)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={quickPick}
              className="px-2.5 py-1 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:text-blue-300 text-xs font-medium flex items-center gap-1"
            >
              <Shuffle className="w-3 h-3" />
              <span>Lucky Dip</span>
            </button>
            {selectedNumbers.length > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Selected Numbers Badges */}
        <div className="flex items-center justify-center gap-2 py-2 min-h-12 bg-slate-950/60 rounded-xl border border-slate-800/80">
          {[0, 1, 2, 3, 4].map((idx) => {
            const num = selectedNumbers[idx];
            return (
              <div
                key={idx}
                className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm transition-all ${
                  num
                    ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-md scale-105'
                    : 'bg-slate-800/60 text-slate-600 border border-dashed border-slate-700'
                }`}
              >
                {num ?? '?'}
              </div>
            );
          })}
        </div>

        {/* 1 - 35 Grid */}
        <div className="grid grid-cols-7 gap-1.5 pt-1">
          {Array.from({ length: 35 }, (_, i) => i + 1).map((n) => {
            const isSelected = selectedNumbers.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggleNumber(n)}
                className={`h-9 rounded-xl font-bold text-xs transition-all flex items-center justify-center ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-400/20 scale-105'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 active:scale-95'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>

        {/* Payment selector for draw */}
        {selectedDraw && selectedDraw.currency === 'COINS' && balances.free_tickets > 0 && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
            <span className="text-slate-300">Use 1 Free Ticket instead of Coins:</span>
            <input
              type="checkbox"
              checked={useFreeTicket}
              onChange={(e) => setUseFreeTicket(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
            />
          </div>
        )}

        {/* Buy Button */}
        <button
          type="button"
          id="buy-ticket-button"
          onClick={handleBuyTicket}
          disabled={isPurchasing || selectedNumbers.length !== 5}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-extrabold text-sm text-white shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Ticket className="w-4 h-4" />
          <span>
            {isPurchasing
              ? 'Securing Ticket...'
              : selectedNumbers.length < 5
              ? `Pick ${5 - selectedNumbers.length} more numbers`
              : `BUY TICKET (${useFreeTicket ? '1 FREE TICKET' : `${selectedDraw?.ticket_price} ${selectedDraw?.currency}`})`}
          </span>
        </button>

        {alertInfo && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              alertInfo.type === 'success'
                ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/70 border border-red-500/40 text-red-300'
            }`}
          >
            {alertInfo.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{alertInfo.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs pt-1">
          <button
            type="button"
            onClick={onViewMyTickets}
            className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 hover:underline"
          >
            <Ticket className="w-3.5 h-3.5" />
            <span>View My Tickets</span>
          </button>
          <span className="text-slate-500 text-[11px]">Match 5 for 70% Pool</span>
        </div>
      </div>

      {/* Recent Resolution Notification Card */}
      {recentResolution && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950 to-slate-900 border border-indigo-500/40 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Draw Outcome Announced!</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">RESOLVED</span>
          </div>
          <div className="text-sm font-extrabold text-white">{recentResolution.draw_title}</div>
          <div className="flex items-center gap-1.5 py-1">
            <span className="text-xs text-slate-400 mr-1">Winning Balls:</span>
            {recentResolution.winning_numbers.map((num) => (
              <span
                key={num}
                className="w-7 h-7 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow"
              >
                {num}
              </span>
            ))}
          </div>
          <div className="text-xs text-slate-300 flex items-center justify-between pt-1 border-t border-slate-800">
            <span>Winners: {recentResolution.winners_count}</span>
            <span className="text-amber-400 font-bold">Distributed: {recentResolution.total_distributed}</span>
          </div>
        </div>
      )}
    </div>
  );
}
