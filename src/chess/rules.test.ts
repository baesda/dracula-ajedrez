import test from 'node:test';
import assert from 'node:assert/strict';
import { DraculaChessEngine, coordsToSquare, squareToCoords, squareToWorld } from './engine';
import { chooseAiMove, chooseAiMoveWithAnalysis, clampElo, getEloSearchProfile } from './ai';

test('coordinate conversions round-trip cleanly', () => {
  assert.deepEqual(squareToCoords('a1'), { file: 0, rank: 0 });
  assert.deepEqual(squareToCoords('h8'), { file: 7, rank: 7 });
  assert.equal(coordsToSquare(4, 3), 'e4');
  const worldA1 = squareToWorld('a1', 1);
  const worldH8 = squareToWorld('h8', 1);
  assert.equal(worldA1.x, -3.5);
  assert.equal(worldA1.z, 3.5);
  assert.equal(worldH8.x, 3.5);
  assert.equal(worldH8.z, -3.5);
});

test('standard opening legal moves and Fool’s Mate checkmate detection', () => {
  const engine = new DraculaChessEngine();
  assert.equal(engine.getTurn(), 'w');
  assert.equal(engine.getPieces().length, 32);

  const e2Moves = engine.getLegalMovesFrom('e2');
  assert.deepEqual(
    e2Moves.map((m) => m.to).sort(),
    ['e3', 'e4'],
  );

  // Fool's Mate: 1. f3 e5 2. g4 Qh4#
  assert.ok(engine.makeMove('f2', 'f3'));
  assert.ok(engine.makeMove('e7', 'e5'));
  assert.ok(engine.makeMove('g2', 'g4'));
  const mate = engine.makeMove('d8', 'h4');
  assert.ok(mate);

  const snap = engine.getSnapshot();
  assert.equal(snap.isCheckmate, true);
  assert.equal(snap.isGameOver, true);
  assert.equal(snap.winner, 'b');
  assert.equal(snap.reason, 'checkmate');
});

test('en passant capture works per standard chess rules', () => {
  const engine = new DraculaChessEngine();
  assert.ok(engine.makeMove('e2', 'e4'));
  assert.ok(engine.makeMove('a7', 'a6'));
  assert.ok(engine.makeMove('e4', 'e5'));
  assert.ok(engine.makeMove('d7', 'd5'));

  const moves = engine.getLegalMovesFrom('e5');
  const ep = moves.find((m) => m.to === 'd6');
  assert.ok(ep);
  assert.equal(ep.isEnPassant, true);

  assert.ok(engine.makeMove('e5', 'd6'));
  const snap = engine.getSnapshot();
  assert.deepEqual(snap.capturedByRed, ['p']);
  assert.equal(
    engine.getPieces().some((p) => p.square === 'd5'),
    false,
  );
});

test('kingside castling is legal when path is clear and unattacked', () => {
  const engine = new DraculaChessEngine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const kingMoves = engine.getLegalMovesFrom('e1');
  const castle = kingMoves.find((m) => m.to === 'g1');
  assert.ok(castle);
  assert.equal(castle.isCastle, true);

  assert.ok(engine.makeMove('e1', 'g1'));
  const pieces = engine.getPieces();
  assert.ok(pieces.some((p) => p.square === 'g1' && p.type === 'k'));
  assert.ok(pieces.some((p) => p.square === 'f1' && p.type === 'r'));
});

test('pawn promotion requires and applies chosen piece', () => {
  const engine = new DraculaChessEngine('7k/4P3/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(engine.isPromotionMove('e7', 'e8'), true);
  const move = engine.makeMove('e7', 'e8', 'n');
  assert.ok(move);
  assert.equal(move.promotion, 'n');
  const promoted = engine.getPieces().find((p) => p.square === 'e8');
  assert.equal(promoted?.type, 'n');
});

test('Elo clamping and search profiles scale from 50 (present-only) to 5000 (hyper-GM future depth)', () => {
  assert.equal(clampElo(10), 50);
  assert.equal(clampElo(50), 50);
  assert.equal(clampElo(2450), 2450);
  assert.equal(clampElo(9999), 5000);

  const p50 = getEloSearchProfile(50);
  const p1500 = getEloSearchProfile(1500);
  const p5000 = getEloSearchProfile(5000);

  assert.equal(p50.sillyPresentOnly, true);
  assert.equal(p50.maxDepth, 1);
  assert.equal(p50.useQuiescence, false);
  assert.equal(p50.useOpeningBook, false);

  assert.equal(p1500.sillyPresentOnly, false);
  assert.ok(p1500.maxDepth >= 3);

  assert.equal(p5000.maxDepth, 8);
  assert.equal(p5000.useQuiescence, true);
  assert.equal(p5000.useNullMove, true);
  assert.equal(p5000.useLmr, true);
  assert.equal(p5000.blunderAmplitudeCp, 0);
});

test('Dracula AI at 5000 Elo finds deep future tactics (Queen sacrifice mate-in-2) while 50 Elo stays shallow', () => {
  // Unique forced mate-in-2: 1. Qd8+ Rxd8 2. Rxd8#
  const tacticalFen = '2r3k1/5ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1';
  const gmAnalysis = chooseAiMoveWithAnalysis(tacticalFen, 5000);
  assert.ok(gmAnalysis.move);
  assert.equal(gmAnalysis.move.from, 'd2');
  assert.equal(gmAnalysis.move.to, 'd8');
  assert.ok(gmAnalysis.depthReached >= 1);

  // Midgame depth comparison: 5000 Elo searches far deeper into the future than 50 Elo
  const midgameFen = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R1BQ1RK1 w - - 0 8';
  const lowAnalysis = chooseAiMoveWithAnalysis(midgameFen, 50);
  const highAnalysis = chooseAiMoveWithAnalysis(midgameFen, 5000);
  assert.ok(lowAnalysis.move);
  assert.ok(highAnalysis.move);
  assert.equal(lowAnalysis.depthReached, 1);
  assert.ok(highAnalysis.depthReached >= 4);
  assert.ok(highAnalysis.nodes > lowAnalysis.nodes * 20);

  // Opening book check at 5000 Elo
  const engineGm = new DraculaChessEngine();
  engineGm.makeMove('e2', 'e4');
  const gmBookMove = chooseAiMove(engineGm.getFen(), 5000);
  assert.ok(gmBookMove);
  assert.ok(['e5', 'c5', 'e6', 'c6'].includes(gmBookMove.to));
});
