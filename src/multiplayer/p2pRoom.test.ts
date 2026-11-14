import assert from 'node:assert/strict';
import test from 'node:test';
import { P2PHostCoordinator } from './p2pRoom';

test('P2PHostCoordinator enforces 5-letter code, join, turn validation, clocks, and resign', () => {
  let now = 2_000_000;
  const host = new P2PHostCoordinator(15, () => now);
  const initial = host.getInitialState();

  assert.match(initial.code, /^[a-z]{5}$/);
  assert.equal(initial.color, 'w');
  assert.equal(initial.clock.wRemainingMs, 15 * 60_000);
  assert.equal(initial.clock.activeTurn, null);

  // Move before guest joins fails cleanly
  const earlyMove = host.handleMove('host', 'e2', 'e4');
  assert.equal(earlyMove.ok, false);

  // Guest joins -> activeTurn starts for Red ('w')
  const joined = host.handleGuestJoin();
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  assert.equal(joined.update.clock.activeTurn, 'w');

  // Guest cannot move first
  const wrongTurn = host.handleMove('guest', 'e7', 'e5');
  assert.equal(wrongTurn.ok, false);

  // Host moves after 5s
  now += 5000;
  const hostMove = host.handleMove('host', 'e2', 'e4');
  assert.equal(hostMove.ok, true);
  if (!hostMove.ok) return;
  assert.equal(hostMove.update.clock.wRemainingMs, 15 * 60_000 - 5000);
  assert.equal(hostMove.update.clock.activeTurn, 'b');

  // Guest resigns after 4s
  now += 4000;
  const resigned = host.handleResign('guest');
  assert.equal(resigned.ok, true);
  if (!resigned.ok) return;
  assert.equal(resigned.update.snapshot.isGameOver, true);
  assert.equal(resigned.update.snapshot.reason, 'resignation');
  assert.equal(resigned.update.snapshot.winner, 'w');
});

test('P2PHostCoordinator handles timeout and rematch cleanly', () => {
  let now = 5_000_000;
  const host = new P2PHostCoordinator(10, () => now);
  const joined = host.handleGuestJoin();
  assert.equal(joined.ok, true);

  now += 10 * 60_000 + 25;
  const timedOut = host.tickTimeout();
  assert.ok(timedOut);
  assert.equal(timedOut.update.snapshot.isGameOver, true);
  assert.equal(timedOut.update.snapshot.reason, 'timeout');
  assert.equal(timedOut.update.snapshot.winner, 'b');

  const rematch = host.handleRematch('host');
  assert.equal(rematch.ok, true);
  if (!rematch.ok) return;
  assert.equal(rematch.update.snapshot.isGameOver, false);
  assert.equal(rematch.update.clock.wRemainingMs, 10 * 60_000);
  assert.equal(rematch.update.clock.bRemainingMs, 10 * 60_000);
});
