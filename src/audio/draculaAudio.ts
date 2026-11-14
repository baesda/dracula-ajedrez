import type { PieceType } from '../chess/types';

class DraculaAudio {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  playSelect(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.06);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playMove(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    // Deep stone clack
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160 * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.11);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);

    // Subtle crisp click overtone
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(480 * pitchJitter, now);
    click.frequency.exponentialRampToValueAtTime(190, now + 0.045);
    clickGain.gain.setValueAtTime(0.09, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    click.connect(clickGain).connect(ctx.destination);
    click.start(now);
    click.stop(now + 0.06);
  }

  playCastle(): void {
    this.playMove();
    setTimeout(() => this.playMove(), 110);
  }

  playCapture(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Heavy slam + spooky minor fifth
    const freqs = [130, 196, 311.13];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.65, now + 0.22);
      gain.gain.setValueAtTime(idx === 0 ? 0.14 : 0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  playKnightLeap(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.16);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.42);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  playCaptureGore(attackerType: PieceType): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Initial sinister low sub-bass rumble across all kills
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, now);
    sub.frequency.setValueAtTime(92, now);
    sub.frequency.exponentialRampToValueAtTime(44, now + 1.6);
    subGain.gain.setValueAtTime(0.14, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.7);
    sub.connect(filter).connect(subGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 1.75);

    const scheduleSquelch = (offset: number, baseFreq: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(baseFreq * 2.2, now + offset);
      f.Q.setValueAtTime(3.2, now + offset);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(baseFreq, now + offset);
      o.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + offset + dur);
      g.gain.setValueAtTime(0.001, now + offset);
      g.gain.linearRampToValueAtTime(0.14, now + offset + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      o.connect(f).connect(g).connect(ctx.destination);
      o.start(now + offset);
      o.stop(now + offset + dur + 0.02);
    };

    if (attackerType === 'b') {
      // Crucifix toll + fire crackle roar
      scheduleSquelch(1.1, 280, 0.6);
      scheduleSquelch(2.6, 170, 1.4);
      scheduleSquelch(3.8, 130, 1.3);
    } else if (attackerType === 'k') {
      // Vampire hiss + neck bite + draining pulse
      scheduleSquelch(1.9, 220, 0.35);
      scheduleSquelch(2.4, 95, 1.6);
      scheduleSquelch(3.9, 85, 1.4);
    } else if (attackerType === 'q') {
      // Arcane orb charge hum + violent disintegration blast
      const charge = ctx.createOscillator();
      const cg = ctx.createGain();
      charge.type = 'sine';
      charge.frequency.setValueAtTime(180, now + 1.8);
      charge.frequency.exponentialRampToValueAtTime(760, now + 4.4);
      cg.gain.setValueAtTime(0.001, now + 1.8);
      cg.gain.linearRampToValueAtTime(0.11, now + 4.2);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 4.6);
      charge.connect(cg).connect(ctx.destination);
      charge.start(now + 1.8);
      charge.stop(now + 4.65);
      scheduleSquelch(5.05, 190, 1.1);
    } else if (attackerType === 'p') {
      // Monstrous jaw creak + 3 wet chomps
      scheduleSquelch(2.1, 140, 0.32);
      scheduleSquelch(2.9, 120, 0.32);
      scheduleSquelch(3.7, 105, 0.45);
    } else if (attackerType === 'n') {
      // Hoof slam + bone crunching maul
      scheduleSquelch(1.3, 110, 0.45);
      scheduleSquelch(2.5, 155, 0.4);
      scheduleSquelch(3.6, 130, 0.55);
    } else {
      // Rook: iron spikes erupt + stone crush
      scheduleSquelch(1.2, 260, 0.4);
      scheduleSquelch(3.6, 90, 0.9);
    }
  }

  playCheck(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Dramatic Dracula organ diminished chord
    const notes = [293.66, 349.23, 415.3]; // D4 - F4 - Ab4
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      osc.frequency.setValueAtTime(freq, now + i * 0.04);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + i * 0.04 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.04);
      osc.stop(now + 0.58);
    });
  }

  playGameOver(victory: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = victory
      ? [220, 261.63, 329.63, 440] // A minor -> octave flourish
      : [220, 207.65, 174.61, 146.83]; // Descending gothic sting
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const start = now + i * 0.12;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.11, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.52);
    });
  }
}

export const draculaAudio = new DraculaAudio();
