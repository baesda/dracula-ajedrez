import test from 'node:test';
import assert from 'node:assert/strict';
import type { PieceType } from '../chess/types';
import {
  CAPTURE_ANIM_DURATION,
  canPieceJump,
  computeCandleFlicker,
  computeMoveHeight,
  getQueenMagicOrbPalette,
} from './animationConfig';

test('all gore capture animations last strictly between 5 and 10 seconds', () => {
  const types: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];
  for (const t of types) {
    const dur = CAPTURE_ANIM_DURATION[t];
    assert.ok(dur >= 5 && dur <= 10, `expected ${t} duration ${dur}s to be within [5, 10]`);
  }
});

test('only the knight can jump over pieces; all other pieces stay grounded', () => {
  assert.equal(canPieceJump('n'), true);
  for (const t of ['p', 'r', 'b', 'q', 'k'] as PieceType[]) {
    assert.equal(canPieceJump(t), false);
    assert.equal(computeMoveHeight(t, 0.5), 0);
  }
  // Knight reaches realistic parabolic arc mid-jump and lands flush on board
  assert.equal(computeMoveHeight('n', 0.05), 0);
  assert.ok(computeMoveHeight('n', 0.5) > 1.2);
  assert.equal(computeMoveHeight('n', 0.95), 0);
});

test('Queen magic orb is purple for red pieces and blue for dark/green pieces', () => {
  const redQueen = getQueenMagicOrbPalette('w');
  const greenQueen = getQueenMagicOrbPalette('b');
  assert.notEqual(redQueen.coreColor, greenQueen.coreColor);
  // Purple has high R & B, low G
  const redR = (redQueen.coreColor >> 16) & 0xff;
  const redG = (redQueen.coreColor >> 8) & 0xff;
  const redB = redQueen.coreColor & 0xff;
  assert.ok(redR > redG && redB > redG, 'Red Queen orb must be purple');
  // Blue has highest B
  const grnR = (greenQueen.coreColor >> 16) & 0xff;
  const grnB = greenQueen.coreColor & 0xff;
  assert.ok(grnB > grnR, 'Green/Dark Queen orb must be blue');
});

test('the 4 red candles flicker asynchronously with distinct intensities', () => {
  const samples = [0, 1, 2, 3].map((i) => computeCandleFlicker(1.25, i));
  const uniqueIntensities = new Set(samples.map((s) => s.intensity.toFixed(3)));
  assert.equal(uniqueIntensities.size, 4);
  for (const s of samples) {
    assert.ok(s.intensity >= 2.0 && s.intensity <= 5.0);
  }
});
