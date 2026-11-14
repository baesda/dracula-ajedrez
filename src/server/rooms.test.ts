import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDisplayClockMs, formatClockTime, normalizeTimeControl } from '../chess/clock';
import { CAPTURE_ANIM_DURATION } from '../three/animationConfig';
import { RoomManager, generateRoomCode, isValidRoomCode } from './rooms';

test('room code generator produces exactly 5 lowercase letters', () => {
  const existing = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const code = generateRoomCode(existing);
    assert.equal(isValidRoomCode(code), true);
    assert.match(code, /^[a-z]{5}$/);
    assert.equal(existing.has(code), false);
    existing.add(code);
  }
});

test('room creation, joining, turn enforcement, and move synchronization', () => {
  const manager = new RoomManager();
  const created = manager.createRoom('host-1');
  assert.match(created.code, /^[a-z]{5}$/);
  assert.equal(created.color, 'w');
  assert.equal(created.clock.initialMinutes, 10);
  assert.equal(created.clock.activeTurn, null);

  // Cannot move before guest joins
  const earlyMove = manager.makeMove(created.code, 'host-1', 'e2', 'e4');
  assert.equal(earlyMove.ok, false);

  // Invalid code rejected
  const badJoin = manager.joinRoom('12345', 'guest-1');
  assert.equal(badJoin.ok, false);

  const missingJoin = manager.joinRoom('zzzzz', 'guest-1');
  assert.equal(missingJoin.ok, false);

  // Valid join starts White clock
  const joined = manager.joinRoom(created.code, 'guest-1');
  assert.equal(joined.ok, true);
  if (joined.ok) {
    assert.equal(joined.color, 'b');
    assert.equal(joined.clock.activeTurn, 'w');
  }

  // Third player rejected
  const third = manager.joinRoom(created.code, 'guest-2');
  assert.equal(third.ok, false);

  // Guest cannot move on White's turn
  const wrongTurn = manager.makeMove(created.code, 'guest-1', 'e7', 'e5');
  assert.equal(wrongTurn.ok, false);

  // Host makes valid opening move
  const hostMove = manager.makeMove(created.code, 'host-1', 'e2', 'e4');
  assert.equal(hostMove.ok, true);
  if (hostMove.ok) {
    assert.equal(hostMove.snapshot.turn, 'b');
    assert.equal(hostMove.snapshot.lastMove?.san, 'e4');
  }

  // Guest responds
  const guestMove = manager.makeMove(created.code, 'guest-1', 'e7', 'e5');
  assert.equal(guestMove.ok, true);
  if (guestMove.ok) {
    assert.equal(guestMove.snapshot.turn, 'w');
  }
});

test('server-authoritative 10/15/30 min clocks deduct exact elapsed time, pause on capture animation, and detect timeout', () => {
  let fakeNow = 1_000_000;
  const manager = new RoomManager(() => fakeNow);

  assert.equal(normalizeTimeControl(10), 10);
  assert.equal(normalizeTimeControl(15), 15);
  assert.equal(normalizeTimeControl(30), 30);
  assert.equal(normalizeTimeControl(99), 10);

  const created = manager.createRoom('host-1', 15);
  assert.equal(created.clock.initialMinutes, 15);
  assert.equal(created.clock.wRemainingMs, 900_000);
  assert.equal(created.clock.bRemainingMs, 900_000);
  assert.equal(created.clock.activeTurn, null);

  // Time passes while waiting for guest -> neither clock ticks
  fakeNow += 25_000;
  const joined = manager.joinRoom(created.code, 'guest-1');
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  assert.equal(joined.clock.wRemainingMs, 900_000);
  assert.equal(joined.clock.bRemainingMs, 900_000);
  assert.equal(joined.clock.activeTurn, 'w');

  // Red thinks for exactly 4,000 ms and plays 1. e4
  fakeNow += 4_000;
  const m1 = manager.makeMove(created.code, 'host-1', 'e2', 'e4');
  assert.equal(m1.ok, true);
  if (!m1.ok) return;
  assert.equal(m1.clock.wRemainingMs, 896_000);
  assert.equal(m1.clock.bRemainingMs, 900_000);
  assert.equal(m1.clock.activeTurn, 'b');

  // Green thinks for 3,000 ms and plays 1... d5
  fakeNow += 3_000;
  const m2 = manager.makeMove(created.code, 'guest-1', 'd7', 'd5');
  assert.equal(m2.ok, true);
  if (!m2.ok) return;
  assert.equal(m2.clock.bRemainingMs, 897_000);
  assert.equal(m2.clock.activeTurn, 'w');

  // Red captures with pawn 2. exd5 (6.0s gore capture animation pauses Green's clock)
  fakeNow += 2_000;
  const m3 = manager.makeMove(created.code, 'host-1', 'e4', 'd5');
  assert.equal(m3.ok, true);
  if (!m3.ok) return;
  assert.equal(m3.clock.wRemainingMs, 894_000);
  assert.equal(
    m3.clock.turnStartedAtMs,
    fakeNow + Math.round(CAPTURE_ANIM_DURATION.p * 1000),
  );

  // During the 6s capture animation (at +4s), Green's display clock stays paused at 897,000 ms!
  const midCaptureDisplay = computeDisplayClockMs(m3.clock, fakeNow + 4_000, 0);
  assert.equal(midCaptureDisplay.bMs, 897_000);

  // 10 seconds after move (4s real thinking after 6s animation), Green has lost 4,000 ms
  const afterAnimDisplay = computeDisplayClockMs(m3.clock, fakeNow + 10_000, 0);
  assert.equal(afterAnimDisplay.bMs, 893_000);

  // Advance until Green's remaining 897s expires completely -> timeout!
  fakeNow = m3.clock.turnStartedAtMs + 897_000;
  const timeoutCheck = manager.checkTimeout(created.code);
  assert.ok(timeoutCheck);
  assert.equal(timeoutCheck.timedOut, true);
  assert.equal(timeoutCheck.snapshot.isGameOver, true);
  assert.equal(timeoutCheck.snapshot.reason, 'timeout');
  assert.equal(timeoutCheck.snapshot.winner, 'w');
  assert.equal(timeoutCheck.clock.bRemainingMs, 0);
  assert.equal(timeoutCheck.clock.activeTurn, null);
});

test('clock formatting never ticks early and compensates client-server clock offset', () => {
  assert.equal(formatClockTime(600_000), '10:00');
  assert.equal(formatClockTime(599_001), '10:00');
  assert.equal(formatClockTime(599_000), '09:59');
  assert.equal(formatClockTime(1), '00:01');
  assert.equal(formatClockTime(0), '00:00');

  // If client clock is 5,000ms ahead of server, offset (-5000) keeps seconds exact
  const clock = {
    initialMinutes: 10 as const,
    wRemainingMs: 600_000,
    bRemainingMs: 600_000,
    activeTurn: 'w' as const,
    turnStartedAtMs: 10_000,
    serverNowMs: 10_000,
  };
  const offsetMs = 10_000 - 15_000; // client local time is 15,000 when server is 10,000
  const disp = computeDisplayClockMs(clock, 16_000, offsetMs); // 1 real second elapsed
  assert.equal(disp.wMs, 599_000);
  assert.equal(formatClockTime(disp.wMs), '09:59');
});
