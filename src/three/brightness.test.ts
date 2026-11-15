import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeBrightnessFromPointerY,
  computeLightingFromBrightness,
  DEFAULT_BRIGHTNESS,
} from './brightness';

test('dragging up increases brightness toward 1 and dragging down decreases toward 0', () => {
  const topVal = computeBrightnessFromPointerY(100, 100, 120);
  const midVal = computeBrightnessFromPointerY(160, 100, 120);
  const lowVal = computeBrightnessFromPointerY(220, 100, 120);

  assert.equal(topVal, 1);
  assert.equal(midVal, 0.5);
  assert.equal(lowVal, 0);
  assert.ok(topVal > midVal && midVal > lowVal);
});

test('default brightness 0.5 preserves exact original Dracula lighting parameters', () => {
  const def = computeLightingFromBrightness(DEFAULT_BRIGHTNESS);
  assert.equal(def.exposure, 0.92);
  assert.equal(def.environmentIntensity, 0.36);
  assert.equal(def.lightMultiplier, 1);

  const bright = computeLightingFromBrightness(1);
  const dim = computeLightingFromBrightness(0);
  assert.ok(bright.exposure > def.exposure && def.exposure > dim.exposure);
  assert.ok(bright.lightMultiplier > def.lightMultiplier && def.lightMultiplier > dim.lightMultiplier);
});
