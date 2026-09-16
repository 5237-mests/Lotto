/**
 * Web Audio API Synthesizer for Fortune Wheel & Casino FX
 * 100% self-contained, zero-asset, zero-latency, works in Telegram WebApp & desktop.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private lastTickTime: number = 0;

  constructor() {
    // Load sound preference from localStorage if available
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('spinner_sound_enabled');
        if (saved !== null) {
          this.soundEnabled = saved === 'true';
        }
      }
    } catch {
      // Ignore storage restrictions
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('spinner_sound_enabled', enabled ? 'true' : 'false');
      }
    } catch {
      // Ignore storage restrictions
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.soundEnabled);
    if (this.soundEnabled) {
      this.playButtonClick();
    }
    return this.soundEnabled;
  }

  /**
   * Mechanical flapper tick sound when needle passes a wheel peg or sector divider
   */
  public playTick(volume = 0.4, pitchShift = 1.0): void {
    if (!this.soundEnabled) return;
    const now = performance.now();
    // Throttle slightly if wheel is rotating ultra fast (prevent audio clipping)
    if (now - this.lastTickTime < 28) return;
    this.lastTickTime = now;

    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      // 1. High crisp wooden flapper click (bandpass filtered transient)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pitch variation gives an organic physical feel
      const baseFreq = (1100 + Math.random() * 250) * pitchShift;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.035);

      gain.gain.setValueAtTime(volume * 0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.035);

      // 2. High-frequency snap (needle release snap)
      const snapOsc = ctx.createOscillator();
      const snapGain = ctx.createGain();
      snapOsc.type = 'sine';
      snapOsc.frequency.setValueAtTime(2400 * pitchShift, t);
      snapOsc.frequency.exponentialRampToValueAtTime(800, t + 0.015);

      snapGain.gain.setValueAtTime(volume * 0.4, t);
      snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

      snapOsc.connect(snapGain);
      snapGain.connect(ctx.destination);

      snapOsc.start(t);
      snapOsc.stop(t + 0.015);
    } catch {
      // Audio playback failsafe
    }
  }

  /**
   * Subtle micro-click when hovering over sectors or interactive wheel elements
   */
  public playHover(): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.025);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.025);
    } catch {
      // Ignore
    }
  }

  /**
   * Whoosh / power-up sweep when a spin begins
   */
  public playSpinStart(): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(680, t + 0.28);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.exponentialRampToValueAtTime(2400, t + 0.28);

      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.35);
    } catch {
      // Ignore
    }
  }

  /**
   * Celebratory win chime / fanfare
   */
  public playWin(isJackpot = false): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const baseNotes = isJackpot
        ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98] // C5, E5, G5, C6, E6, G6 (Grand Fanfare)
        : [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

      baseNotes.forEach((freq, index) => {
        const t = ctx.currentTime + index * 0.11;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = isJackpot ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t);

        const noteDuration = isJackpot ? 0.45 : 0.32;
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + noteDuration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + noteDuration);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Friendly soft descending chime for "Try Again"
   */
  public playNoWin(): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const notes = [440, 370]; // A4 -> F#4 soft warm bell
      notes.forEach((freq, index) => {
        const t = ctx.currentTime + index * 0.16;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.28);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Standard UI button click
   */
  public playButtonClick(): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.04);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.04);
    } catch {
      // Ignore
    }
  }
}

export const soundManager = new SoundEngine();

/**
 * Telegram WebApp & Web vibration haptic feedback helper
 */
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'selection' = 'medium'): void {
  try {
    const tg = (window as any)?.Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      if (type === 'selection') {
        tg.HapticFeedback.selectionChanged();
      } else {
        tg.HapticFeedback.impactOccurred(type);
      }
      return;
    }
  } catch {
    // Ignore
  }

  // Fallback to HTML5 navigator.vibrate if supported
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      const pattern = type === 'heavy' ? [25, 40, 25] : type === 'medium' ? 20 : 10;
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore
  }
}
