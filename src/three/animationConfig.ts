import type { PieceType, TeamColor } from '../chess/types';

/**
 * Duration in seconds for each piece's bloody/gore capture cinematic (all 5s - 10s).
 */
export const CAPTURE_ANIM_DURATION: Record<PieceType, number> = {
  p: 6.0, // Bebé Zombi: opens enormous jaw and devours victim alive
  b: 6.2, // Alfil: raises crucifix, bleeds from cross, victim bursts into flames
  n: 6.4, // Caballo: leaps & crushes victim with hooves, mauling flesh & bone
  r: 6.5, // Torre: obsidian iron spikes impale victim, castle crushes from above
  k: 6.8, // Rey (Conde Drácula): bites victim's neck and drains/consumes them
  q: 7.0, // Reina (Maléfica): extends both hands, conjures purple/blue orb in left, grabs with right, throws & disintegrates victim
};

/**
 * Only the Knight (Caballo) is permitted to jump over pieces during movement.
 */
export function canPieceJump(type: PieceType): boolean {
  return type === 'n';
}

export interface QueenOrbPalette {
  coreColor: number;
  auraColor: number;
  sparkHex: number;
}

/**
 * Red team ('w') Queen conjures a purple magic sphere ("bola morada").
 * Green/Dark team ('b') Queen conjures a blue magic sphere ("bola azul").
 */
export function getQueenMagicOrbPalette(color: TeamColor): QueenOrbPalette {
  if (color === 'w') {
    return {
      coreColor: 0xb638ff,
      auraColor: 0x6a0dad,
      sparkHex: 0xd975ff,
    };
  }
  return {
    coreColor: 0x2699ff,
    auraColor: 0x0a53be,
    sparkHex: 0x66ccff,
  };
}

/**
 * Computes vertical jump height during piece movement.
 * Non-knights stay strictly grounded (0) and slide/glide across the board.
 * Knights perform a realistic 3-phase equine jump: rear gather -> parabolic leap -> landing absorb.
 */
export function computeMoveHeight(type: PieceType, progress: number): number {
  if (!canPieceJump(type)) {
    return 0;
  }
  const t = Math.max(0, Math.min(1, progress));
  // Phase 1 (0..0.16): crouch & rear preparation on ground
  if (t < 0.16) {
    return 0;
  }
  // Phase 3 (0.84..1): heavy hoof landing absorption
  if (t > 0.84) {
    return 0;
  }
  // Phase 2 (0.16..0.84): realistic parabolic equine jump over pieces
  const u = (t - 0.16) / 0.68;
  return 4 * u * (1 - u) * 1.48;
}

export interface CandleFlickerSample {
  intensity: number;
  scaleXZ: number;
  scaleY: number;
  swayX: number;
  swayZ: number;
}

// Distinct irrational/prime angular frequencies and phases per candle for true asynchronous flickering
const CANDLE_PROFILES = [
  { f1: 5.3, f2: 13.7, f3: 23.1, p1: 0.1, p2: 1.7, p3: 3.9 },
  { f1: 6.7, f2: 15.1, f3: 29.3, p1: 2.3, p2: 4.1, p3: 0.8 },
  { f1: 4.9, f2: 11.3, f3: 19.7, p1: 4.6, p2: 0.9, p3: 2.5 },
  { f1: 7.1, f2: 17.3, f3: 27.9, p1: 1.4, p2: 3.3, p3: 5.2 },
] as const;

export function computeCandleFlicker(elapsed: number, index: number): CandleFlickerSample {
  const prof = CANDLE_PROFILES[index % CANDLE_PROFILES.length];
  const wave1 = Math.sin(elapsed * prof.f1 + prof.p1);
  const wave2 = Math.sin(elapsed * prof.f2 + prof.p2);
  const wave3 = Math.sin(elapsed * prof.f3 + prof.p3);
  const organic = wave1 * 0.52 + wave2 * 0.31 + wave3 * 0.17;

  // Strong flickering red firelight (base ~3.65, dips & surges organically between ~2.1 and ~4.8)
  const intensity = Math.max(2.1, 3.65 + organic * 1.15);
  const scaleY = 1.0 + organic * 0.22;
  const scaleXZ = 1.0 - organic * 0.09;
  const swayX = Math.sin(elapsed * (prof.f1 * 0.7) + prof.p2) * 0.08;
  const swayZ = Math.cos(elapsed * (prof.f2 * 0.45) + prof.p3) * 0.08;

  return { intensity, scaleXZ, scaleY, swayX, swayZ };
}
