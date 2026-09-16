import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, ArrowRight, RefreshCw, Key, Hash, Dices, Lock } from 'lucide-react';
import { SpinAuditLog, SpinnerSector } from '../types';

interface ProvablyFairAuditProps {
  initialServerSeed?: string;
  initialClientSeed?: string;
  initialNonce?: number;
  telegramUserId: number;
}

interface VerificationResult {
  server_seed_hash: string;
  outcome_hash: string;
  winning_index: number;
  sector: SpinnerSector;
}

export function ProvablyFairAudit({
  initialServerSeed = '',
  initialClientSeed = '',
  initialNonce = 0,
  telegramUserId,
}: ProvablyFairAuditProps) {
  const [serverSeed, setServerSeed] = useState<string>(initialServerSeed);
  const [clientSeed, setClientSeed] = useState<string>(initialClientSeed);
  const [nonce, setNonce] = useState<number>(initialNonce);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [history, setHistory] = useState<SpinAuditLog[]>([]);

  // Sync if initial props change
  useEffect(() => {
    if (initialServerSeed) setServerSeed(initialServerSeed);
    if (initialClientSeed) setClientSeed(initialClientSeed);
    if (initialNonce !== undefined) setNonce(initialNonce);
  }, [initialServerSeed, initialClientSeed, initialNonce]);

  // Fetch recent spin history
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/spinner/history', {
        headers: {
          'x-telegram-user-id': telegramUserId.toString(),
        },
      });
      const data = await res.json();
      if (data.success) {
        setHistory(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }, [telegramUserId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const verifyOutcome = async () => {
    if (!serverSeed || !clientSeed) {
      setErrorMsg('Please provide both Server Seed and Client Seed');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setResult(null);

    try {
      const res = await fetch('/api/v1/spinner/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_seed: serverSeed.trim(),
          client_seed: clientSeed.trim(),
          nonce: Number(nonce),
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Verification failed');
      }
      setResult(json.data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromHistory = (log: SpinAuditLog) => {
    setServerSeed(log.server_seed);
    setClientSeed(log.client_seed);
    setNonce(log.nonce);
    setErrorMsg('');
    setResult(null);
  };

  return (
    <div id="fairness-audit-module" className="w-full max-w-md mx-auto space-y-5 pb-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Provably Fair HMAC-SHA256</span>
        </div>
        <h2 className="text-2xl font-black text-slate-100 tracking-tight">Fairness Verifier</h2>
        <p className="text-xs text-slate-400">Cryptographically audit any spin or draw result</p>
      </div>

      {/* Formula Explainer Card */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-2">
        <div className="flex items-center gap-2 text-slate-200 font-bold">
          <Lock className="w-4 h-4 text-emerald-400" />
          <span>How Provably Fair Works</span>
        </div>
        <p className="text-slate-400 text-[11px] leading-relaxed">
          Before every spin, the backend generates a secure 256-bit Server Seed and commits its SHA-256 hash to your device. You provide your own Client Seed. The final outcome is strictly:
        </p>
        <div className="p-2 rounded bg-slate-950 text-[11px] font-mono text-emerald-400 border border-slate-800 text-center overflow-x-auto">
          Outcome = HMAC_SHA256(ServerSeed, ClientSeed + &quot;:&quot; + Nonce)
        </div>
        <p className="text-slate-400 text-[11px]">
          Because the server committed the hash <em>prior</em> to knowing your spin, neither party can manipulate the resulting sector or numbers.
        </p>
      </div>

      {/* Audit Form */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-lg">
        <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <Key className="w-4 h-4 text-blue-400" />
          <span>Audit Input Parameters</span>
        </div>

        <div className="space-y-2 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Server Seed (Revealed after spin):</label>
            <input
              type="text"
              value={serverSeed}
              onChange={(e) => setServerSeed(e.target.value)}
              placeholder="e.g. 8f3c7b2a..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Client Seed:</label>
            <input
              type="text"
              value={clientSeed}
              onChange={(e) => setClientSeed(e.target.value)}
              placeholder="e.g. seed_123456"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Nonce (Spin Counter):</label>
            <input
              type="number"
              value={nonce}
              onChange={(e) => setNonce(Number(e.target.value))}
              placeholder="0"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <button
          type="button"
          id="verify-math-btn"
          onClick={verifyOutcome}
          disabled={isLoading || !serverSeed || !clientSeed}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-xs text-white shadow active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Computing Cryptographic Hash...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>VERIFY MATHEMATICAL INTEGRITY</span>
            </>
          )}
        </button>

        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Verification Success Box */}
        {result && (
          <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2 text-xs animate-in fade-in">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Mathematical Proof Confirmed!</span>
            </div>
            <div className="space-y-1 font-mono text-[10px] text-slate-300">
              <div className="truncate">
                <span className="text-slate-500">SHA256(ServerSeed): </span>
                <span className="text-blue-300">{result.server_seed_hash}</span>
              </div>
              <div className="truncate">
                <span className="text-slate-500">HMAC-SHA256: </span>
                <span className="text-emerald-300">{result.outcome_hash}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Determined Sector:</span>
              <span className="font-extrabold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-white">
                #{result.winning_index} — {result.sector.label}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* User's Recent Spin Logs for 1-click verification */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200">Your Recent Spin Audit Trail</span>
          <button
            type="button"
            onClick={fetchHistory}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500">
            No spin logs recorded yet. Spin the lucky wheel to generate audit data!
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {history.map((log) => (
              <div
                key={log.spin_id}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1 hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-white">{log.sector_label}</span>
                  <span className="text-[10px] text-slate-500 font-mono">Nonce #{log.nonce}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  Seed: {log.server_seed}
                </div>
                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-slate-500">
                    {new Date(log.spin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadFromHistory(log)}
                    className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-0.5"
                  >
                    <span>Load for Audit</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
