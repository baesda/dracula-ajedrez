export const DEFAULT_BRIGHTNESS = 0.5;

export interface BrightnessLightingParams {
  exposure: number;
  environmentIntensity: number;
  lightMultiplier: number;
}

export function clampBrightness(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BRIGHTNESS;
  return Math.min(1, Math.max(0, value));
}

/**
 * Computes normalized brightness [0..1] from pointer clientY within a vertical track.
 * Dragging UP (smaller clientY, closer to rectTop) increases brightness toward 1.
 * Dragging DOWN (larger clientY, closer to rectTop + rectHeight) decreases brightness toward 0.
 */
export function computeBrightnessFromPointerY(
  clientY: number,
  rectTop: number,
  rectHeight: number,
): number {
  if (rectHeight <= 0) return DEFAULT_BRIGHTNESS;
  const ratioFromBottom = (rectTop + rectHeight - clientY) / rectHeight;
  return clampBrightness(ratioFromBottom);
}

/**
 * Maps normalized brightness [0..1] to Three.js toneMappingExposure, environmentIntensity,
 * and light intensity multiplier. Default (0.5) preserves the original Dracula lighting.
 */
export function computeLightingFromBrightness(value: number): BrightnessLightingParams {
  const t = clampBrightness(value);
  if (t <= 0.5) {
    const k = t / 0.5;
    return {
      exposure: 0.25 + k * (0.92 - 0.25),
      environmentIntensity: 0.12 + k * (0.36 - 0.12),
      lightMultiplier: 0.32 + k * (1.0 - 0.32),
    };
  }
  const k = (t - 0.5) / 0.5;
  return {
    exposure: 0.92 + k * (2.35 - 0.92),
    environmentIntensity: 0.36 + k * (0.9 - 0.36),
    lightMultiplier: 1.0 + k * (1.95 - 1.0),
  };
}
