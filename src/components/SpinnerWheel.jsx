import React, { useRef, useState, useEffect, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  ShieldCheck,
  KeyRound,
  Dices,
  RefreshCw,
  Gift,
  Trophy,
  AlertTriangle,
  WifiOff,
  Volume2,
  VolumeX,
  Info
} from 'lucide-react';
import { apiFetch } from '../utils/api.js';
import { soundManager } from '../utils/sound';

/**
 * 5 color-coded sectors matching the prize database schema:
 * 0: Try Again (Slate dark)
 * 1: 10 Coins (Sky blue)
 * 2: 1 Free Ticket (Emerald green)
 * 3: 50 Coins (Amber gold)
 * 4: JACKPOT 500 Coins (Crimson red)
 */
export const DEFAULT_SPINNER_SECTORS = [
  { id: 0, label: 'Try Again', weight: 400, prize_type: 'NO_WIN', prize_value: 0, color: '#1E293B' },
  { id: 1, label: '10 Coins', weight: 300, prize_type: 'COINS', prize_value: 10, color: '#0284C7' },
  { id: 2, label: '1 Free Ticket', weight: 200, prize_type: 'FREE_TICKET', prize_value: 1, color: '#059669' },
  { id: 3, label: '50 Coins', weight: 90, prize_type: 'COINS', prize_value: 50, color: '#D97706' },
  { id: 4, label: 'JACKPOT (500)', weight: 10, prize_type: 'COINS', prize_value: 500, color: '#DC2626' }
];

/**
 * Trigger Telegram Haptic Feedback via @twa-dev/sdk with window fallback
 */
function triggerTelegramHaptic(type) {
  try {
    const haptic = WebApp?.HapticFeedback || (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback);
    if (!haptic) return;

    if (type === 'selectionChanged') {
      haptic.selectionChanged?.();
    } else if (type === 'impact') {
      haptic.impactOccurred?.('medium');
    } else if (type === 'success') {
      haptic.notificationOccurred?.('success');
    } else if (type === 'error') {
      haptic.notificationOccurred?.('error');
    }
  } catch {
    // Graceful fallback
  }
}

/**
 * SpinnerWheel component for Telegram Mini App
 */
export function SpinnerWheel({
  initData = '',
  balances = { coins: 200, stars: 20, free_tickets: 3 },
  onBalanceUpdate,
  onNavigateToVerifier,
  telegramUserId = 7770001
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const [sectors, setSectors] = useState(DEFAULT_SPINNER_SECTORS);
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [userNonce, setUserNonce] = useState(0);
  const [clientSeed, setClientSeed] = useState(() => `seed_${Math.floor(Math.random() * 899999 + 100000)}`);
  const [isSpinning, setIsSpinning] = useState(false);
  const [useFreeTicket, setUseFreeTicket] = useState(false);
  const [lastWin, setLastWin] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorType, setErrorType] = useState(null);
  const [canvasSize, setCanvasSize] = useState(320);

  // Sound and Hover state
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => soundManager.isEnabled());
  const [hoveredSector, setHoveredSector] = useState(null);
  const [isCenterHovered, setIsCenterHovered] = useState(false);
  const [needleAngle, setNeedleAngle] = useState(0);

  // Refs for tracking animation & hover in requestAnimationFrame
  const currentRotationRef = useRef(0);
  const animationFrameIdRef = useRef(null);
  const hoveredSectorRef = useRef(null);
  const isCenterHoveredRef = useRef(false);
  const pointerDownRef = useRef(null);

  hoveredSectorRef.current = hoveredSector;
  isCenterHoveredRef.current = isCenterHovered;

  // Resolve initData string from props or SDK
  const effectiveInitData = initData || WebApp?.initData || (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) || '';

  // Adaptive resize observer for crisp Retina canvas rendering
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          const target = Math.min(Math.max(Math.floor(width - 24), 280), 340);
          setCanvasSize(target);
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Fetch spinner config on mount
  const fetchConfig = useCallback(async () => {
    try {
      const headers = {
        'x-telegram-user-id': telegramUserId.toString(),
      };
      if (effectiveInitData) {
        headers['Authorization'] = `tma ${effectiveInitData}`;
      }

      const res = await apiFetch('/api/v1/spinner/config', { headers });
      if (res.success && res.data) {
        if (Array.isArray(res.data.sectors) && res.data.sectors.length > 0) {
          setSectors(res.data.sectors);
        }
        if (res.data.server_seed_hash) setServerSeedHash(res.data.server_seed_hash);
        if (typeof res.data.user_nonce === 'number') setUserNonce(res.data.user_nonce);
      }
    } catch (err) {
      console.warn('[Spinner] Config fetch notice:', err);
    }
  }, [telegramUserId, effectiveInitData]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Canvas drawing routine with hover highlight support
  const drawWheel = useCallback((rotationAngle = 0, hoveredIdx = hoveredSectorRef.current, centerHovered = isCenterHoveredRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const size = canvasSize;

    // Handle high-DPI crisp rendering
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const radius = size / 2;
    const total = sectors.length;
    const arc = (2 * Math.PI) / total;

    ctx.translate(radius, radius);
    ctx.rotate(rotationAngle);

    // 1. Draw Sectors with Hover Highlights
    sectors.forEach((sector, i) => {
      const startAngle = i * arc;
      const endAngle = startAngle + arc;
      const isSectorHovered = i === hoveredIdx && !isSpinning;

      // Sector wedge base
      ctx.beginPath();
      ctx.fillStyle = sector.color;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius - 14, startAngle, endAngle);
      ctx.lineTo(0, 0);
      ctx.fill();

      // If hovered, render radiant gloss and glowing golden outline
      if (isSectorHovered) {
        ctx.save();
        const midAngle = startAngle + arc / 2;
        const highlightGrad = ctx.createRadialGradient(
          0, 0, 20,
          Math.cos(midAngle) * (radius - 20), Math.sin(midAngle) * (radius - 20), radius - 14
        );
        highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
        highlightGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.18)');
        highlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');

        ctx.fillStyle = highlightGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius - 14, startAngle, endAngle);
        ctx.lineTo(0, 0);
        ctx.fill();

        // Glowing gold highlight border
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#FDE047';
        ctx.shadowColor = '#FDE047';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      // Divider lines
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isSectorHovered ? '#FDE047' : '#090D16';
      ctx.stroke();

      // Sector Text & Graphic
      ctx.save();
      ctx.rotate(startAngle + arc / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';

      const fontSize = isSectorHovered
        ? Math.max(13, Math.floor(size * 0.046))
        : Math.max(12, Math.floor(size * 0.042));
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

      // Text shadow for high readability
      ctx.shadowColor = isSectorHovered ? '#FDE047' : 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = isSectorHovered ? 8 : 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      ctx.fillText(sector.label, radius - 26, 0);
      ctx.restore();
    });

    // 2. Outer rim metallic ring
    ctx.beginPath();
    ctx.arc(0, 0, radius - 12, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = (hoveredIdx !== null && !isSpinning) ? '#38BDF8' : '#0284C7';
    ctx.stroke();

    // 3. Perimeter glowing light pegs
    const numPins = 20;
    for (let p = 0; p < numPins; p++) {
      const pinAngle = (p / numPins) * Math.PI * 2;
      const px = (radius - 6) * Math.cos(pinAngle);
      const py = (radius - 6) * Math.sin(pinAngle);

      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = p % 2 === 0 ? '#FBBF24' : '#FFFFFF';
      ctx.shadowColor = p % 2 === 0 ? 'rgba(251, 191, 36, 0.9)' : 'rgba(255, 255, 255, 0.8)';
      ctx.shadowBlur = 5;
      ctx.fill();
    }

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // 4. Center hub
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#0F172A';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = centerHovered && !isSpinning ? '#FDE047' : '#38BDF8';
    ctx.stroke();

    // Inner brass center jewel
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = centerHovered && !isSpinning ? '#FBBF24' : '#F59E0B';
    if (centerHovered && !isSpinning) {
      ctx.shadowColor = '#FDE047';
      ctx.shadowBlur = 12;
    }
    ctx.fill();

    ctx.restore();
  }, [sectors, canvasSize, isSpinning]);

  useEffect(() => {
    drawWheel(currentRotationRef.current, hoveredSector, isCenterHovered);
  }, [drawWheel, hoveredSector, isCenterHovered]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, []);

  /**
   * Pointer interaction events (Hover, Tap, Flick, Swipe)
   */
  const handlePointerMove = (e) => {
    if (isSpinning) {
      if (hoveredSector !== null) setHoveredSector(null);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - (rect.width / 2);
    const y = e.clientY - rect.top - (rect.height / 2);
    const dist = Math.sqrt(x * x + y * y);
    const radius = canvasSize / 2;

    if (dist <= 26) {
      // Center jewel hovered
      if (!isCenterHovered) {
        setIsCenterHovered(true);
        soundManager.playHover();
      }
      if (hoveredSector !== null) setHoveredSector(null);
      return;
    }

    if (isCenterHovered) {
      setIsCenterHovered(false);
    }

    if (dist > 26 && dist < radius - 8) {
      let pointerAngle = Math.atan2(y, x) - currentRotationRef.current;
      pointerAngle = ((pointerAngle % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
      const arc = (2 * Math.PI) / sectors.length;
      const sectorIndex = Math.floor(pointerAngle / arc) % sectors.length;

      if (sectorIndex !== hoveredSector) {
        setHoveredSector(sectorIndex);
        soundManager.playHover();
        triggerTelegramHaptic('selectionChanged');
      }
    } else {
      if (hoveredSector !== null) setHoveredSector(null);
    }
  };

  const handlePointerLeave = () => {
    setHoveredSector(null);
    setIsCenterHovered(false);
    pointerDownRef.current = null;
  };

  const handlePointerDown = (e) => {
    pointerDownRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now()
    };
  };

  const handlePointerUp = (e) => {
    if (!pointerDownRef.current || isSpinning) return;
    const dx = e.clientX - pointerDownRef.current.x;
    const dy = e.clientY - pointerDownRef.current.y;
    const dt = performance.now() - pointerDownRef.current.time;
    pointerDownRef.current = null;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Swiped or flicked with sufficient velocity
    if (dist > 28 && dt < 600) {
      handleSpin();
      return;
    }
    // Direct tap on canvas
    if (dist < 12) {
      handleSpin();
    }
  };

  const handleKeyDown = (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !isSpinning) {
      e.preventDefault();
      handleSpin();
    }
  };

  /**
   * Triggers POST /api/v1/spinner/spin, applies cubic ease-out rotation,
   * plays realistic audio ticks synced to pegs passing the flapper,
   * fires Telegram haptic feedback during spin, and notifies success on stop.
   */
  const handleSpin = async () => {
    if (isSpinning) return;
    setErrorMsg('');
    setErrorType(null);
    setLastWin(null);
    setHoveredSector(null);
    setIsCenterHovered(false);

    // 1. Client-Side Balance Check before hitting API
    const SPIN_COST = 10;
    if (useFreeTicket) {
      if (balances.free_tickets < 1) {
        setErrorType('balance');
        setErrorMsg('You have 0 Free Tickets! Switch to Coins or use the Faucet.');
        soundManager.playNoWin();
        triggerTelegramHaptic('error');
        return;
      }
    } else {
      if (balances.coins < SPIN_COST) {
        setErrorType('balance');
        setErrorMsg('Insufficient Coins! You need at least 10 Coins to spin.');
        soundManager.playNoWin();
        triggerTelegramHaptic('error');
        return;
      }
    }

    setIsSpinning(true);
    soundManager.playSpinStart();
    triggerTelegramHaptic('impact');

    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-telegram-user-id': telegramUserId.toString(),
      };
      if (effectiveInitData) {
        headers['Authorization'] = `tma ${effectiveInitData}`;
      }

      // 2. Call server-authoritative spin route
      const response = await apiFetch('/api/v1/spinner/spin', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          client_seed: clientSeed,
          use_free_ticket: useFreeTicket,
          initData: effectiveInitData
        })
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Server error occurred during spin');
      }

      const result = response.data;

      // Update balances immediately
      if (onBalanceUpdate && result.balances) {
        onBalanceUpdate(result.balances);
      }

      // 3. Calculate target stopping angle
      // The needle pointer is fixed at the top (angle 3*PI/2 or 270 deg)
      const targetIndex = result.winning_index;
      const totalSectors = sectors.length;
      const arc = (2 * Math.PI) / totalSectors;

      const targetSectorCenter = (3 * Math.PI / 2) - (targetIndex * arc + arc / 2);

      // Normalize current start angle to [0, 2*PI)
      const startAngle = ((currentRotationRef.current % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);

      // Calculate minimal forward angular delta to target sector
      let deltaAngle = (targetSectorCenter - startAngle) % (2 * Math.PI);
      if (deltaAngle < 0) {
        deltaAngle += 2 * Math.PI;
      }

      // Add full spin rotations
      const extraRotations = result.animation?.total_rotations || 8;
      const totalAngularDistance = (extraRotations * 2 * Math.PI) + deltaAngle;
      const finalAngle = currentRotationRef.current + totalAngularDistance;

      const duration = result.animation?.duration_ms || 4200;
      const startTime = performance.now();

      // Track pegs passing the needle flapper
      let lastPegPassed = -1;
      let lastSectorPassed = -1;

      // 4. Smooth Cubic Ease-Out Rotation Animation with audio/haptic sync
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Smooth cubic ease-out: 1 - (1 - t)^3.2
        const cubicEaseOut = 1 - Math.pow(1 - progress, 3.2);
        const currentAngle = currentRotationRef.current + (finalAngle - currentRotationRef.current) * cubicEaseOut;

        drawWheel(currentAngle, null, false);

        // Top needle is at 3*PI/2; calculate peg passing under needle
        const topPointerAngle = (((3 * Math.PI / 2 - currentAngle) % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        const pegIndexPassing = Math.floor(topPointerAngle / (2 * Math.PI / 20));

        if (pegIndexPassing !== lastPegPassed) {
          lastPegPassed = pegIndexPassing;
          const progressRemaining = 1 - progress;
          const tickVolume = Math.min(0.45, 0.12 + progressRemaining * 0.35);
          const pitchShift = Math.min(1.35, 0.75 + progressRemaining * 0.45);

          soundManager.playTick(tickVolume, pitchShift);
          triggerTelegramHaptic('selectionChanged');

          // Mechanical needle flapper tip animation
          setNeedleAngle(Math.random() > 0.5 ? -9 : -6);
          setTimeout(() => setNeedleAngle(0), 45);
        }

        // Sector boundary transition haptic
        const normalizedAngle = ((currentAngle % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        const sectorIndexPassing = Math.floor(normalizedAngle / arc);
        if (sectorIndexPassing !== lastSectorPassed) {
          lastSectorPassed = sectorIndexPassing;
        }

        if (progress < 1) {
          animationFrameIdRef.current = requestAnimationFrame(animate);
        } else {
          // Animation finished: wheel arrived accurately at targetIndex
          currentRotationRef.current = finalAngle;
          setNeedleAngle(0);
          drawWheel(finalAngle, null, false);
          setIsSpinning(false);
          setLastWin(result);

          if (result.provably_fair?.next_server_seed_hash) {
            setServerSeedHash(result.provably_fair.next_server_seed_hash);
          }
          if (typeof result.provably_fair?.nonce === 'number') {
            setUserNonce(result.provably_fair.nonce + 1);
          }

          // Trigger Telegram WebApp haptic & celebratory sound
          triggerTelegramHaptic('success');

          if (result.sector.prize_type !== 'NO_WIN') {
            const isJackpot = result.sector.prize_type === 'COINS' && result.sector.prize_value >= 500;
            soundManager.playWin(isJackpot);

            confetti({
              particleCount: isJackpot ? 120 : (result.sector.prize_value >= 50 ? 85 : 45),
              spread: 70,
              origin: { y: 0.6 }
            });
          } else {
            soundManager.playNoWin();
          }
        }
      };

      animationFrameIdRef.current = requestAnimationFrame(animate);

    } catch (err) {
      console.error('[Spinner] Execution error:', err);
      setIsSpinning(false);
      soundManager.playNoWin();
      triggerTelegramHaptic('error');

      const msg = err?.message || 'Error executing spin';
      if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance')) {
        setErrorType('balance');
        setErrorMsg('Insufficient Coins! Tap Top-Up Faucet to get free coins.');
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('timeout')) {
        setErrorType('network');
        setErrorMsg('Network drop detected. Please check your connection and try again.');
      } else {
        setErrorType('general');
        setErrorMsg(msg);
      }
    }
  };

  const totalSectorsWeight = sectors.reduce((acc, s) => acc + (s.weight || 0), 0) || 1000;

  return (
    <div
      ref={containerRef}
      id="spinner-module"
      className="flex flex-col items-center w-full max-w-md mx-auto space-y-4 pb-6 select-none"
    >
      {/* Title, Provably Fair Badge & Sound Toggle */}
      <div className="w-full flex items-center justify-between px-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-950/70 border border-blue-500/30 text-blue-400 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Provably Fair Instant Wheel</span>
        </div>

        {/* Audio FX Toggle */}
        <button
          type="button"
          id="sound-toggle-btn"
          onClick={() => {
            const next = soundManager.toggle();
            setIsSoundEnabled(next);
            triggerTelegramHaptic('impact');
          }}
          className={`px-2.5 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition ${
            isSoundEnabled
              ? 'bg-blue-950/80 border-blue-500/40 text-blue-300 hover:bg-blue-900/60'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title={isSoundEnabled ? 'Sound FX Enabled (Click to Mute)' : 'Sound Muted (Click to Unmute)'}
        >
          {isSoundEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-blue-400" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span>{isSoundEnabled ? 'Sound ON' : 'Muted'}</span>
        </button>
      </div>

      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black text-slate-100 tracking-tight">Lucky Fortune Wheel</h2>
        <p className="text-xs text-slate-400">Server-authoritative HMAC-SHA256 • Haptic & Audio FX</p>
      </div>

      {/* Interactive Live Sector Hover Inspector Pill */}
      <div className="w-full flex items-center justify-center min-h-[30px] px-2">
        {hoveredSector !== null && sectors[hoveredSector] && !isSpinning ? (
          <div
            id="sector-hover-tooltip"
            className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/95 border border-cyan-400/50 shadow-lg shadow-cyan-950/40 text-xs animate-in fade-in zoom-in-95 duration-150"
          >
            <span
              className="w-2.5 h-2.5 rounded-full ring-2 ring-white/40 shadow-sm"
              style={{ backgroundColor: sectors[hoveredSector].color }}
            />
            <span className="font-bold text-white">{sectors[hoveredSector].label}</span>
            <span className="text-slate-500">•</span>
            <span className="text-amber-400 font-mono text-[11px]">
              {((sectors[hoveredSector].weight / totalSectorsWeight) * 100).toFixed(1)}% odds
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-cyan-400 font-semibold text-[11px]">Tap to Spin!</span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Hover or tap sectors to inspect odds • Tap or flick wheel to spin</span>
          </div>
        )}
      </div>

      {/* HTML5 Canvas Wheel Container with Hover Glow and Spring Deflection Needle */}
      <div className="relative flex items-center justify-center p-2">
        {/* Needle Indicator Pointer with Deflection Animation */}
        <div
          className="absolute top-0 left-1/2 z-20 flex flex-col items-center pointer-events-none transition-transform duration-75 origin-top"
          style={{ transform: `translateX(-50%) translateY(-4px) rotate(${needleAngle}deg)` }}
          aria-hidden="true"
        >
          <div className="w-0 h-0 border-l-[11px] border-l-transparent border-r-[11px] border-r-transparent border-t-[22px] border-t-amber-400 filter drop-shadow-[0_2px_6px_rgba(251,191,36,0.75)]" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-300 -mt-6 border border-amber-600 shadow" />
        </div>

        {/* Wheel Frame with Outer Glow & Responsive Hover Scaling */}
        <div
          className={`relative rounded-full p-2.5 bg-gradient-to-b from-slate-800 to-slate-900 border-2 transition-all duration-300 shadow-2xl ${
            hoveredSector !== null || isCenterHovered
              ? 'border-cyan-400/80 shadow-[0_0_35px_rgba(6,182,212,0.4)] scale-[1.015]'
              : 'border-slate-700/80 shadow-blue-950/50 hover:border-slate-600'
          }`}
        >
          <canvas
            ref={canvasRef}
            id="spinner-canvas"
            tabIndex={0}
            role="button"
            aria-label="Fortune Wheel - Click, tap or flick to spin"
            className="rounded-full select-none cursor-pointer transition-transform active:scale-[0.985] focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onKeyDown={handleKeyDown}
            title="Tap, click or flick to spin!"
          />
        </div>
      </div>

      {/* Controls & Configuration */}
      <div className="w-full px-4 space-y-3">
        {/* Payment selector: Coins vs Free Ticket */}
        <div className="flex items-center justify-between p-1 bg-slate-900/90 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            id="pay-coins-btn"
            onClick={() => {
              setUseFreeTicket(false);
              soundManager.playButtonClick();
              triggerTelegramHaptic('selectionChanged');
            }}
            disabled={isSpinning}
            className={`flex-1 py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
              !useFreeTicket ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🪙 10 Coins</span>
          </button>
          <button
            type="button"
            id="pay-ticket-btn"
            onClick={() => {
              setUseFreeTicket(true);
              soundManager.playButtonClick();
              triggerTelegramHaptic('selectionChanged');
            }}
            disabled={isSpinning}
            className={`flex-1 py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
              useFreeTicket ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>1 Ticket ({balances?.free_tickets ?? 0})</span>
          </button>
        </div>

        {/* Main Spin Action Button */}
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

        {/* Clean Error Display for Network Drops or Insufficient Balance */}
        {errorMsg && (
          <div
            id="spinner-error-banner"
            className="p-3 bg-red-950/70 border border-red-500/40 text-red-200 text-xs rounded-xl flex items-center gap-2 animate-in fade-in"
          >
            {errorType === 'network' ? (
              <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <div className="flex-1">{errorMsg}</div>
          </div>
        )}

        {/* Winning Result Card */}
        {lastWin && (
          <div
            id="spinner-win-card"
            className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/40 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <span className="text-xs uppercase tracking-wider font-bold text-slate-400">Result</span>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  lastWin.sector.prize_type !== 'NO_WIN'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {lastWin.sector.prize_type !== 'NO_WIN' ? 'WINNER!' : 'BETTER LUCK NEXT TIME'}
              </span>
            </div>

            <div className="text-center py-2">
              <div className="text-2xl font-black text-white">{lastWin.sector.label}</div>
              <div className="text-xs text-slate-300 mt-1">
                {lastWin.sector.prize_type === 'COINS' && `+${lastWin.sector.prize_value} Coins credited to your wallet`}
                {lastWin.sector.prize_type === 'FREE_TICKET' && `+${lastWin.sector.prize_value} Free Lottery Ticket added`}
                {lastWin.sector.prize_type === 'NO_WIN' && 'Every spin is provably fair. Try again!'}
              </div>
            </div>

            {/* Provably Fair Audit CTA */}
            {onNavigateToVerifier && lastWin.provably_fair && (
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-mono">Nonce: #{lastWin.provably_fair.nonce}</span>
                <button
                  type="button"
                  onClick={() =>
                    onNavigateToVerifier(
                      lastWin.provably_fair.revealed_server_seed,
                      lastWin.provably_fair.client_seed,
                      lastWin.provably_fair.nonce
                    )
                  }
                  className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 hover:underline"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verify HMAC Proof</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Provably Fair Seed Input Details */}
        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Provably Fair RNG</span>
            </div>
            <span className="text-[10px] text-slate-500">Nonce: #{userNonce}</span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div>
              <span className="text-slate-400">Current Server Seed Commitment (SHA256):</span>
              <div className="font-mono text-[10px] text-slate-300 bg-slate-950 p-1.5 rounded truncate border border-slate-800">
                {serverSeedHash || 'Loading active seed hash...'}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-slate-400 mb-0.5">
                <span>Client Entropy Seed:</span>
                <button
                  type="button"
                  onClick={() => {
                    setClientSeed(`seed_${Math.floor(Math.random() * 899999 + 100000)}`);
                    soundManager.playButtonClick();
                    triggerTelegramHaptic('selectionChanged');
                  }}
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
                  placeholder="Enter client seed"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sectors Table matching database */}
        <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800/60 text-xs">
          <div className="text-slate-400 font-medium mb-1.5 flex items-center justify-between">
            <span>Wheel Sectors & Weights:</span>
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Info className="w-3 h-3" />
              <span>Hover sector for odds</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {sectors.map((s) => (
              <div
                key={s.id}
                onMouseEnter={() => {
                  if (!isSpinning) {
                    setHoveredSector(s.id);
                    soundManager.playHover();
                  }
                }}
                onMouseLeave={() => {
                  if (!isSpinning && hoveredSector === s.id) {
                    setHoveredSector(null);
                  }
                }}
                className={`flex items-center justify-between p-1 px-2 rounded cursor-pointer transition ${
                  hoveredSector === s.id
                    ? 'bg-blue-950/80 ring-1 ring-cyan-400/60'
                    : 'bg-slate-950/60 hover:bg-slate-800/50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-slate-200 truncate">{s.label}</span>
                </span>
                <span className="text-slate-400 font-mono ml-1">{((s.weight / totalSectorsWeight) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpinnerWheel;
