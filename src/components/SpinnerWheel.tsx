import React, { useRef, useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, ShieldCheck, KeyRound, Dices, RefreshCw, Gift, Trophy } from 'lucide-react';
import { SpinnerSector, SpinnerConfig, SpinResult, UserBalances } from '../types';

interface SpinnerWheelProps {
  balances: UserBalances;
  onBalanceUpdate: (balances: UserBalances) => void;
  onNavigateToVerifier: (serverSeed: string, clientSeed: string, nonce: number) => void;
  telegramUserId: number;
}

const DEFAULT_SECTORS: SpinnerSector[] = [
  { id: 0, label: 'Try Again', weight: 400, prize_type: 'NO_WIN', prize_value: 0, color: '#1E293B' },
  { id: 1, label: '10 Coins', weight: 300, prize_type: 'COINS', prize_value: 10, color: '#0284C7' },
  { id: 2, label: '1 Free Ticket', weight: 200, prize_type: 'FREE_TICKET', prize_value: 1, color: '#059669' },
  { id: 3, label: '50 Coins', weight: 90, prize_type: 'COINS', prize_value: 50, color: '#D97706' },
  { id: 4, label: 'JACKPOT (500)', weight: 10, prize_type: 'COINS', prize_value: 500, color: '#DC2626' }
];

export function SpinnerWheel({
  balances,
  onBalanceUpdate,
  onNavigateToVerifier,
  telegramUserId
}: SpinnerWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sectors, setSectors] = useState<SpinnerSector[]>(DEFAULT_SECTORS);
  const [serverSeedHash, setServerSeedHash] = useState<string>('');
  const [userNonce, setUserNonce] = useState<number>(0);
  const [clientSeed, setClientSeed] = useState<string>(() => `seed_${Math.floor(Math.random() * 899999 + 100000)}`);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [useFreeTicket, setUseFreeTicket] = useState<boolean>(false);
  const [lastWin, setLastWin] = useState<SpinResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const currentRotationRef = useRef<number>(0);

  // Fetch spinner config on mount
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/spinner/config', {
        headers: {
          'x-telegram-user-id': telegramUserId.toString(),
        }
      });
      const data = await res.json();
      if (data.success) {
        setSectors(data.data.sectors);
        setServerSeedHash(data.data.server_seed_hash);
        setUserNonce(data.data.user_nonce);
      }
    } catch (err) {
      console.error('Error fetching spinner config:', err);
    }
  }, [telegramUserId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Canvas drawing routine
  const drawWheel = useCallback((rotationAngle = 0) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const radius = width / 2;
    const total = sectors.length;
    const arc = (2 * Math.PI) / total;

    ctx.clearRect(0, 0, width, height);

    // Save initial state
    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(rotationAngle);

    // Draw sectors
    sectors.forEach((sector, i) => {
      const angle = i * arc;
      ctx.beginPath();
      ctx.fillStyle = sector.color;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius - 14, angle, angle + arc);
      ctx.lineTo(0, 0);
      ctx.fill();

      // Sector border
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      // Sector Text
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 13px system-ui, sans-serif';

      // Subtle drop shadow for label
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(sector.label, radius - 26, 0);
      ctx.restore();
    });

    // Outer rim border with lights
    ctx.beginPath();
    ctx.arc(0, 0, radius - 12, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Outer edge dots
    const numDots = 20;
    for (let d = 0; d < numDots; d++) {
      const dotAngle = (d / numDots) * Math.PI * 2;
      const dotX = (radius - 6) * Math.cos(dotAngle);
      const dotY = (radius - 6) * Math.sin(dotAngle);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fillStyle = d % 2 === 0 ? '#facc15' : '#ffffff';
      ctx.fill();
    }

    // Center hub
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Center star icon / dot
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();

    ctx.restore();
  }, [sectors]);

  useEffect(() => {
    drawWheel(currentRotationRef.current);
  }, [drawWheel]);

  const triggerHaptic = (type: 'impact' | 'selection' | 'success') => {
    try {
      const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: {
        impactOccurred: (style: string) => void;
        selectionChanged: () => void;
        notificationOccurred: (type: string) => void;
      } } } }).Telegram?.WebApp?.HapticFeedback;

      if (!tg) return;
      if (type === 'impact') tg.impactOccurred('medium');
      if (type === 'selection') tg.selectionChanged();
      if (type === 'success') tg.notificationOccurred('success');
    } catch {
      // safe fallback
    }
  };

  const handleSpin = async () => {
    if (isSpinning) return;
    setErrorMsg('');
    setLastWin(null);

    // Validation
    if (useFreeTicket && balances.free_tickets < 1) {
      setErrorMsg('You have 0 Free Tickets! Switch to Coins or use faucet.');
      return;
    }
    if (!useFreeTicket && balances.coins < 10) {
      setErrorMsg('Insufficient Coins (need 10 Coins). Tap Top-Up Faucet to get free coins!');
      return;
    }

    setIsSpinning(true);
    triggerHaptic('impact');

    try {
      const res = await fetch('/api/v1/spinner/spin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-user-id': telegramUserId.toString(),
        },
        body: JSON.stringify({
          client_seed: clientSeed,
          use_free_ticket: useFreeTicket
        })
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Spin failed');
      }

      const result: SpinResult = json.data;
      onBalanceUpdate(result.balances);

      // Target sector index & angle calculations
      const targetIndex = result.winning_index;
      const totalSectors = sectors.length;
      const sectorArc = (2 * Math.PI) / totalSectors;

      // Pointer is fixed at top (270 degrees or -90 deg from 0 rad).
      // When wheel rotates by currentAngle, sector `i` sits from (angle + i*arc) to (angle + (i+1)*arc).
      // Top pointer corresponds to (3*PI/2) mod 2*PI.
      // To land center of sector targetIndex at the pointer:
      const targetAngle = (3 * Math.PI / 2) - (targetIndex * sectorArc + sectorArc / 2);
      const totalRotations = result.animation.total_rotations || 8;
      const startAngle = currentRotationRef.current % (2 * Math.PI);
      const destinationAngle = startAngle + (totalRotations * 2 * Math.PI) + (targetAngle - startAngle);

      const duration = result.animation.duration_ms || 4200;
      const startTime = performance.now();

      let lastSectorNotified = -1;

      const animate = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Cubic ease out
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3.5);
        const currentAngle = startAngle + (destinationAngle - startAngle) * easeOut(progress);

        currentRotationRef.current = currentAngle;
        drawWheel(currentAngle);

        // Haptic feedback tick when passing sectors
        const normalizedAngle = (currentAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const currentSectorPassing = Math.floor(normalizedAngle / sectorArc);
        if (currentSectorPassing !== lastSectorNotified) {
          lastSectorNotified = currentSectorPassing;
          triggerHaptic('selection');
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsSpinning(false);
          setLastWin(result);
          setServerSeedHash(result.provably_fair.next_server_seed_hash);
          setUserNonce(result.provably_fair.nonce + 1);

          triggerHaptic('success');

          if (result.sector.prize_type !== 'NO_WIN') {
            confetti({
              particleCount: result.sector.prize_type === 'COINS' && result.sector.prize_value >= 50 ? 100 : 40,
              spread: 60,
              origin: { y: 0.6 }
            });
          }
        }
      };

      requestAnimationFrame(animate);
    } catch (err: unknown) {
      console.error(err);
      setIsSpinning(false);
      setErrorMsg(err instanceof Error ? err.message : 'Error executing spin');
    }
  };

  return (
    <div id="spinner-module" className="flex flex-col items-center w-full max-w-md mx-auto space-y-5 pb-6">
      {/* Title & Banner */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-950/70 border border-blue-500/30 text-blue-400 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Provably Fair Instant Wheel</span>
        </div>
        <h2 className="text-2xl font-black text-slate-100 tracking-tight">Lucky Fortune Wheel</h2>
        <p className="text-xs text-slate-400">Server-authoritative HMAC-SHA256 outcome</p>
      </div>

      {/* Wheel Canvas Container */}
      <div className="relative flex items-center justify-center p-2">
        {/* Top Indicator Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20 flex flex-col items-center">
          <div className="w-0 h-0 border-l-[11px] border-l-transparent border-r-[11px] border-r-transparent border-t-[22px] border-t-amber-400 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-300 -mt-6 border border-amber-600 shadow" />
        </div>

        {/* Wheel Outer Frame with pulse */}
        <div className="rounded-full p-2.5 bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-slate-700/80 shadow-2xl glow-wheel">
          <canvas
            ref={canvasRef}
            width={320}
            height={320}
            className="rounded-full select-none cursor-pointer"
            onClick={!isSpinning ? handleSpin : undefined}
          />
        </div>
      </div>

      {/* Spin Controls */}
      <div className="w-full px-4 space-y-3">
        {/* Payment selector */}
        <div className="flex items-center justify-between p-1 bg-slate-900/90 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            id="pay-coins-btn"
            onClick={() => setUseFreeTicket(false)}
            className={`flex-1 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              !useFreeTicket ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🪙 10 Coins</span>
          </button>
          <button
            type="button"
            id="pay-ticket-btn"
            onClick={() => setUseFreeTicket(true)}
            className={`flex-1 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              useFreeTicket ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>1 Free Ticket ({balances.free_tickets})</span>
          </button>
        </div>

        {/* Big Action Button */}
        <button
          type="button"
          id="spin-action-button"
          onClick={handleSpin}
          disabled={isSpinning}
          className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-base shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSpinning ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Spinning Destiny...</span>
            </>
          ) : (
            <>
              <Dices className="w-5 h-5" />
              <span>{useFreeTicket ? 'SPIN WITH FREE TICKET' : 'SPIN NOW (10 COINS)'}</span>
            </>
          )}
        </button>

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-500/40 text-red-300 text-xs rounded-xl text-center">
            {errorMsg}
          </div>
        )}

        {/* Winning Result Card */}
        {lastWin && (
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/40 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <span className="text-xs uppercase tracking-wider font-bold text-slate-400">Result</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                lastWin.sector.prize_type !== 'NO_WIN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
              }`}>
                {lastWin.sector.prize_type !== 'NO_WIN' ? 'WINNER' : 'BETTER LUCK NEXT TIME'}
              </span>
            </div>

            <div className="text-center py-2">
              <div className="text-2xl font-black text-white">{lastWin.sector.label}</div>
              <div className="text-xs text-slate-400 mt-1">
                {lastWin.sector.prize_type === 'COINS' && `+${lastWin.sector.prize_value} Coins credited to wallet`}
                {lastWin.sector.prize_type === 'FREE_TICKET' && `+${lastWin.sector.prize_value} Free Lottery Ticket added`}
                {lastWin.sector.prize_type === 'NO_WIN' && 'Don\'t give up, jackpot awaits!'}
              </div>
            </div>

            {/* Provably fair audit button */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-mono">Nonce: #{lastWin.provably_fair.nonce}</span>
              <button
                type="button"
                onClick={() => onNavigateToVerifier(
                  lastWin.provably_fair.revealed_server_seed,
                  lastWin.provably_fair.client_seed,
                  lastWin.provably_fair.nonce
                )}
                className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 hover:underline"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verify HMAC Fairness</span>
              </button>
            </div>
          </div>
        )}

        {/* Provably Fair Seed Input Accordion */}
        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Provably Fair Parameters</span>
            </div>
            <span className="text-[10px] text-slate-500">Nonce: #{userNonce}</span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div>
              <span className="text-slate-400">Current Server Seed Hash (SHA256):</span>
              <div className="font-mono text-[10px] text-slate-300 bg-slate-950 p-1.5 rounded truncate border border-slate-800">
                {serverSeedHash || 'Fetching active seed...'}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-slate-400 mb-0.5">
                <span>Your Client Seed:</span>
                <button
                  type="button"
                  onClick={() => setClientSeed(`seed_${Math.floor(Math.random() * 899999 + 100000)}`)}
                  disabled={isSpinning}
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Randomize</span>
                </button>
              </div>
              <div className="flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-1" />
                <input
                  type="text"
                  value={clientSeed}
                  onChange={(e) => setClientSeed(e.target.value)}
                  disabled={isSpinning}
                  className="w-full bg-slate-950 px-2 py-1 rounded text-slate-200 border border-slate-800 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                  placeholder="Enter custom client seed"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sectors Probability Table */}
        <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800/60 text-xs">
          <div className="text-slate-400 font-medium mb-1.5">Prize Sectors & Probability:</div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {sectors.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-1 px-2 rounded bg-slate-950/60">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-slate-200">{s.label}</span>
                </span>
                <span className="text-slate-500 font-mono">{((s.weight / 1000) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
