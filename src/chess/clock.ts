import type { ClockState, TimeControlMinutes } from './types';

export const ALLOWED_TIME_CONTROLS: readonly TimeControlMinutes[] = [10, 15, 30];

export function normalizeTimeControl(value: unknown): TimeControlMinutes {
  if (value === 10 || value === 15 || value === 30) {
    return value;
  }
  return 10;
}

/**
 * Computes exact live remaining milliseconds for both teams synchronized against
 * the server clock offset so seconds never tick early or skip due to interval drift.
 */
export function computeDisplayClockMs(
  clock: ClockState,
  clientNowMs: number,
  serverOffsetMs: number,
): { wMs: number; bMs: number } {
  const estimatedServerNow = clientNowMs + serverOffsetMs;
  const elapsed = clock.activeTurn
    ? Math.max(0, estimatedServerNow - clock.turnStartedAtMs)
    : 0;

  return {
    wMs: clock.activeTurn === 'w' ? Math.max(0, clock.wRemainingMs - elapsed) : clock.wRemainingMs,
    bMs: clock.activeTurn === 'b' ? Math.max(0, clock.bRemainingMs - elapsed) : clock.bRemainingMs,
  };
}

/**
 * Formats milliseconds into exact MM:SS chess clock display.
 * Uses Math.ceil so 10:00.000 displays 10:00, 09:59.999 displays 09:59,
 * and 00:00 is shown strictly when 0 ms remain.
 */
export function formatClockTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = clamped === 0 ? 0 : Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
