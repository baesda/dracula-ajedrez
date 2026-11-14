import { Chess, type Color, type Move } from 'chess.js';
import { MAX_AI_ELO, MIN_AI_ELO, type PieceType } from './types';

export function clampElo(elo: number): number {
  if (!Number.isFinite(elo)) return 1500;
  return Math.max(MIN_AI_ELO, Math.min(MAX_AI_ELO, Math.round(elo)));
}

const MATE_SCORE = 1000000;
const MATE_THRESHOLD = 900000;

// Piece codes: 0 empty, 1=P, 2=N, 3=B, 4=R, 5=Q, 6=K (positive = White, negative = Black)
const EMPTY = 0;
const WP = 1;
const WN = 2;
const WB = 3;
const WR = 4;
const WQ = 5;
const WK = 6;
const BP = -1;
const BN = -2;
const BB = -3;
const BR = -4;
const BQ = -5;
const BK = -6;

const PIECE_VALUES = [0, 100, 320, 335, 500, 900, 20000];
const CHAR_TO_ABS: Record<PieceType, number> = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
const ABS_TO_CHAR: PieceType[] = ['p', 'p', 'n', 'b', 'r', 'q', 'k'];

// Piece-square tables from White's perspective (rank 8 at row 0 -> rank 1 at row 7)
const PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  55, 55, 55, 62, 62, 55, 55, 55,
  14, 14, 24, 36, 36, 24, 14, 14,
  6, 6, 14, 30, 30, 14, 6, 6,
  0, 0, 6, 26, 26, 6, 0, 0,
  5, -5, -8, 0, 0, -8, -5, 5,
  5, 10, 10, -24, -24, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -30, 6, 16, 20, 20, 16, 6, -30,
  -30, 6, 20, 26, 26, 20, 6, -30,
  -30, 6, 20, 26, 26, 20, 6, -30,
  -30, 10, 16, 20, 20, 16, 10, -30,
  -40, -20, 0, 6, 6, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_PST = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -10, 10, 12, 14, 14, 12, 10, -10,
  -10, 6, 12, 16, 16, 12, 6, -10,
  -10, 6, 14, 16, 16, 14, 6, -10,
  -10, 14, 12, 12, 12, 12, 14, -10,
  -10, 10, 0, 0, 0, 0, 10, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const ROOK_PST = [
  0, 0, 4, 8, 8, 4, 0, 0,
  14, 20, 20, 20, 20, 20, 20, 14,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 4, 12, 12, 4, 0, 0,
];

const QUEEN_PST = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 6, 6, 6, 6, 0, -10,
  -5, 0, 6, 8, 8, 6, 0, -5,
  0, 0, 6, 8, 8, 6, 0, -5,
  -10, 6, 6, 6, 6, 6, 0, -10,
  -10, 0, 6, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];

const KING_MID_PST = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 24, 0, 0, 0, 0, 24, 20,
  22, 36, 12, 0, 0, 12, 36, 22,
];

const KING_END_PST = [
  -50, -30, -20, -20, -20, -20, -30, -50,
  -30, -10, 5, 10, 10, 5, -10, -30,
  -20, 5, 22, 28, 28, 22, 5, -20,
  -20, 10, 28, 36, 36, 28, 10, -20,
  -20, 10, 28, 36, 36, 28, 10, -20,
  -20, 5, 22, 28, 28, 22, 5, -20,
  -30, -10, 5, 10, 10, 5, -10, -30,
  -50, -30, -20, -20, -20, -20, -30, -50,
];

const PASSED_PAWN_BONUS = [0, 10, 18, 32, 56, 95, 150, 0];

// Curated Grandmaster Repertoire (Carlsen / Kasparov / Nakamura / Kramnik / Tal)
const GM_LINES: string[][] = [
  ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'c1e3', 'e7e5', 'd4b3', 'c8e6'],
  ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'f2f3', 'e7e5', 'd4b3', 'c8e6'],
  ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'e7e5', 'd4b5', 'd7d6'],
  ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'g7g6', 'c1e3', 'f8g7'],
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6'],
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1g1', 'f6e4', 'd2d4', 'e4d6', 'b5c6', 'd7c6'],
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d3', 'd7d6', 'e1g1', 'a7a6'],
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5', 'c2c3', 'd7d6'],
  ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'e8g8', 'g1f3', 'h7h6'],
  ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c4d5', 'e6d5', 'c1g5', 'c7c6'],
  ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'd5c4', 'a2a4', 'c8f5'],
  ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'e7e6', 'e2e3', 'b8d7'],
  ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'e2e3', 'e8g8', 'f1d3', 'd7d5', 'g1f3', 'c7c5'],
  ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g1f3', 'b7b6', 'g2g3', 'c8b7', 'f1g2', 'f8e7'],
  ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'g1f3', 'e8g8', 'f1e2', 'e7e5'],
  ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'c4d5', 'f6d5', 'e2e4', 'd5c3', 'b2c3', 'f8g7'],
  ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g2g3', 'd7d5', 'f1g2', 'f8e7', 'g1f3', 'e8g8', 'e1g1', 'd5c4'],
  ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'f8b4', 'e4e5', 'c7c5', 'a2a3', 'b4c3'],
  ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1d2', 'c7c5', 'e4d5', 'e6d5', 'g1f3', 'b8c6'],
  ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'c8f5', 'e4g3', 'f5g6'],
  ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g1f3', 'b8c6', 'g2g3', 'd7d5', 'c4d5', 'f6d5'],
  ['c2c4', 'c7c5', 'g1f3', 'g8f6', 'b1c3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'e7e6'],
  ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'd7d6', 'e5f3', 'f6e4', 'd2d4', 'd6d5'],
  ['g1f3', 'd7d5', 'c2c4', 'e7e6', 'g2g3', 'g8f6', 'f1g2', 'f8e7', 'e1g1', 'e8g8'],
];

function normalizeFenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

const GM_OPENING_BOOK: Map<string, string[]> = (() => {
  const book = new Map<string, string[]>();
  for (const line of GM_LINES) {
    const sim = new Chess();
    for (const uci of line) {
      const key = normalizeFenKey(sim.fen());
      const existing = book.get(key) ?? [];
      if (!existing.includes(uci)) {
        existing.push(uci);
        book.set(key, existing);
      }
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.slice(4, 5) || undefined;
      try {
        sim.move({ from, to, promotion: promo });
      } catch {
        break;
      }
    }
  }
  return book;
})();

// Deterministic Zobrist hash tables (piece index 0..11 mapped via piece + 6: BP..BK -> 0..5? map -6..-1 -> 0..5, 1..6 -> 6..11)
const Z_HI = new Uint32Array(13 * 64);
const Z_LO = new Uint32Array(13 * 64);
const Z_TURN_HI = 0x9e3779b1;
const Z_TURN_LO = 0x85ebca77;
const Z_CASTLE_HI = new Uint32Array(16);
const Z_CASTLE_LO = new Uint32Array(16);
const Z_EP_HI = new Uint32Array(9);
const Z_EP_LO = new Uint32Array(9);
(() => {
  let s1 = 0x243f6a88;
  let s2 = 0x13198a2e;
  const next32 = () => {
    s1 ^= s1 << 13;
    s1 ^= s1 >>> 17;
    s1 ^= s1 << 5;
    s2 = (s2 * 1664525 + 1013904223) >>> 0;
    return (s1 ^ s2) >>> 0;
  };
  for (let i = 0; i < Z_HI.length; i++) {
    Z_HI[i] = next32();
    Z_LO[i] = next32();
  }
  for (let i = 0; i < 16; i++) {
    Z_CASTLE_HI[i] = next32();
    Z_CASTLE_LO[i] = next32();
  }
  for (let i = 0; i < 9; i++) {
    Z_EP_HI[i] = next32();
    Z_EP_LO[i] = next32();
  }
})();

const KNIGHT_DR = [-2, -2, -1, -1, 1, 1, 2, 2];
const KNIGHT_DC = [-1, 1, -2, 2, -2, 2, -1, 1];
const KING_DR = [-1, -1, -1, 0, 0, 1, 1, 1];
const KING_DC = [-1, 0, 1, -1, 1, -1, 0, 1];
const DIAG_DR = [-1, -1, 1, 1];
const DIAG_DC = [-1, 1, -1, 1];
const ORTHO_DR = [-1, 1, 0, 0];
const ORTHO_DC = [0, 0, -1, 1];

// Castling mask bits
const CR_WK = 1;
const CR_WQ = 2;
const CR_BK = 4;
const CR_BQ = 8;

// Fast Move bit layout:
// from: 0..5, to: 6..11, promo: 12..14 (0=none, 2=N, 5=Q), flag: 15..17 (0=std, 1=ep, 2=castle, 3=dpawn), capAbs: 18..20
const FLAG_NONE = 0;
const FLAG_EP = 1;
const FLAG_CASTLE = 2;
const FLAG_DPAWN = 3;

function packMove(from: number, to: number, promo = 0, flag = 0, capAbs = 0): number {
  return from | (to << 6) | (promo << 12) | (flag << 15) | (capAbs << 18);
}

const MAX_PLY = 64;
const MOVE_BUF_STRIDE = 256;

class FastBoard {
  b = new Int8Array(64);
  turnWhite = true;
  castle = 0;
  epSq = -1;
  wkSq = 60;
  bkSq = 4;
  hashHi = 0;
  hashLo = 0;

  // Zero-alloc undo & search stacks
  undoPiece = new Int8Array(MAX_PLY);
  undoCap = new Int8Array(MAX_PLY);
  undoCastle = new Uint8Array(MAX_PLY);
  undoEp = new Int8Array(MAX_PLY);
  undoWk = new Uint8Array(MAX_PLY);
  undoBk = new Uint8Array(MAX_PLY);
  undoHi = new Uint32Array(MAX_PLY);
  undoLo = new Uint32Array(MAX_PLY);
  pathKeys = new Float64Array(MAX_PLY);

  moveBuf = new Int32Array(MAX_PLY * MOVE_BUF_STRIDE);
  scoreBuf = new Int32Array(MAX_PLY * MOVE_BUF_STRIDE);

  static fromChess(chess: Chess): FastBoard {
    const fb = new FastBoard();
    const grid = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = grid[r][c];
        if (!p) continue;
        const abs = CHAR_TO_ABS[p.type];
        const code = p.color === 'w' ? abs : -abs;
        const sq = r * 8 + c;
        fb.b[sq] = code;
        if (code === WK) fb.wkSq = sq;
        else if (code === BK) fb.bkSq = sq;
      }
    }
    fb.turnWhite = chess.turn() === 'w';
    const wc = chess.getCastlingRights('w');
    const bc = chess.getCastlingRights('b');
    if (wc.k) fb.castle |= CR_WK;
    if (wc.q) fb.castle |= CR_WQ;
    if (bc.k) fb.castle |= CR_BK;
    if (bc.q) fb.castle |= CR_BQ;

    const epStr = chess.fen().split(' ')[3];
    if (epStr && epStr !== '-') {
      fb.epSq = squareStrToIdx(epStr);
    }
    fb.recomputeHash();
    return fb;
  }

  recomputeHash(): void {
    let hi = 0;
    let lo = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = this.b[sq];
      if (p !== 0) {
        const idx = (p + 6) * 64 + sq;
        hi ^= Z_HI[idx];
        lo ^= Z_LO[idx];
      }
    }
    if (!this.turnWhite) {
      hi ^= Z_TURN_HI;
      lo ^= Z_TURN_LO;
    }
    hi ^= Z_CASTLE_HI[this.castle];
    lo ^= Z_CASTLE_LO[this.castle];
    const epIdx = this.epSq >= 0 ? (this.epSq & 7) + 1 : 0;
    hi ^= Z_EP_HI[epIdx];
    lo ^= Z_EP_LO[epIdx];
    this.hashHi = hi >>> 0;
    this.hashLo = lo >>> 0;
  }

  getHashKey(): number {
    return (this.hashHi & 0x1fffff) * 4294967296 + (this.hashLo >>> 0);
  }

  isSquareAttacked(sq: number, byWhite: boolean): boolean {
    const r = sq >> 3;
    const c = sq & 7;
    const b = this.b;

    // Pawns
    if (byWhite) {
      if (r + 1 < 8) {
        if (c - 1 >= 0 && b[(r + 1) * 8 + (c - 1)] === WP) return true;
        if (c + 1 < 8 && b[(r + 1) * 8 + (c + 1)] === WP) return true;
      }
    } else {
      if (r - 1 >= 0) {
        if (c - 1 >= 0 && b[(r - 1) * 8 + (c - 1)] === BP) return true;
        if (c + 1 < 8 && b[(r - 1) * 8 + (c + 1)] === BP) return true;
      }
    }

    // Knights
    const enemyKnight = byWhite ? WN : BN;
    for (let i = 0; i < 8; i++) {
      const nr = r + KNIGHT_DR[i];
      const nc = c + KNIGHT_DC[i];
      if ((nr & 7) === nr && (nc & 7) === nc && b[nr * 8 + nc] === enemyKnight) return true;
    }

    // King
    const enemyKing = byWhite ? WK : BK;
    for (let i = 0; i < 8; i++) {
      const kr = r + KING_DR[i];
      const kc = c + KING_DC[i];
      if ((kr & 7) === kr && (kc & 7) === kc && b[kr * 8 + kc] === enemyKing) return true;
    }

    // Orthogonal (Rook / Queen)
    const enemyR = byWhite ? WR : BR;
    const enemyQ = byWhite ? WQ : BQ;
    for (let d = 0; d < 4; d++) {
      const dr = ORTHO_DR[d];
      const dc = ORTHO_DC[d];
      let nr = r + dr;
      let nc = c + dc;
      while ((nr & 7) === nr && (nc & 7) === nc) {
        const p = b[nr * 8 + nc];
        if (p !== 0) {
          if (p === enemyR || p === enemyQ) return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }

    // Diagonal (Bishop / Queen)
    const enemyB = byWhite ? WB : BB;
    for (let d = 0; d < 4; d++) {
      const dr = DIAG_DR[d];
      const dc = DIAG_DC[d];
      let nr = r + dr;
      let nc = c + dc;
      while ((nr & 7) === nr && (nc & 7) === nc) {
        const p = b[nr * 8 + nc];
        if (p !== 0) {
          if (p === enemyB || p === enemyQ) return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }

    return false;
  }

  inCheck(): boolean {
    return this.isSquareAttacked(this.turnWhite ? this.wkSq : this.bkSq, !this.turnWhite);
  }

  makeMove(move: number, ply: number): boolean {
    const from = move & 63;
    const to = (move >> 6) & 63;
    const promo = (move >> 12) & 7;
    const flag = (move >> 15) & 7;

    const movingPiece = this.b[from];
    const captured = this.b[to];

    this.undoPiece[ply] = movingPiece;
    this.undoCap[ply] = captured;
    this.undoCastle[ply] = this.castle;
    this.undoEp[ply] = this.epSq;
    this.undoWk[ply] = this.wkSq;
    this.undoBk[ply] = this.bkSq;
    this.undoHi[ply] = this.hashHi;
    this.undoLo[ply] = this.hashLo;

    // Remove old castle & ep hash
    let hi = this.hashHi ^ Z_CASTLE_HI[this.castle] ^ Z_EP_HI[this.epSq >= 0 ? (this.epSq & 7) + 1 : 0];
    let lo = this.hashLo ^ Z_CASTLE_LO[this.castle] ^ Z_EP_LO[this.epSq >= 0 ? (this.epSq & 7) + 1 : 0];

    // Remove moving piece from `from`
    const fromIdx = (movingPiece + 6) * 64 + from;
    hi ^= Z_HI[fromIdx];
    lo ^= Z_LO[fromIdx];
    this.b[from] = EMPTY;

    // Remove captured piece if any
    if (captured !== EMPTY) {
      const capIdx = (captured + 6) * 64 + to;
      hi ^= Z_HI[capIdx];
      lo ^= Z_LO[capIdx];
    }

    // Place piece (or promoted piece) at `to`
    const placed = promo !== 0 ? (this.turnWhite ? promo : -promo) : movingPiece;
    this.b[to] = placed;
    const toIdx = (placed + 6) * 64 + to;
    hi ^= Z_HI[toIdx];
    lo ^= Z_LO[toIdx];

    if (movingPiece === WK) this.wkSq = to;
    else if (movingPiece === BK) this.bkSq = to;

    // Special flags
    if (flag === FLAG_EP) {
      const capSq = this.turnWhite ? to + 8 : to - 8;
      const epPawn = this.b[capSq];
      const epPIdx = (epPawn + 6) * 64 + capSq;
      hi ^= Z_HI[epPIdx];
      lo ^= Z_LO[epPIdx];
      this.b[capSq] = EMPTY;
    } else if (flag === FLAG_CASTLE) {
      let rFrom = 0;
      let rTo = 0;
      if (to === 62) { rFrom = 63; rTo = 61; }
      else if (to === 58) { rFrom = 56; rTo = 59; }
      else if (to === 6) { rFrom = 7; rTo = 5; }
      else if (to === 2) { rFrom = 0; rTo = 3; }
      const rook = this.b[rFrom];
      this.b[rFrom] = EMPTY;
      this.b[rTo] = rook;
      const rfIdx = (rook + 6) * 64 + rFrom;
      const rtIdx = (rook + 6) * 64 + rTo;
      hi ^= Z_HI[rfIdx] ^ Z_HI[rtIdx];
      lo ^= Z_LO[rfIdx] ^ Z_LO[rtIdx];
    }

    this.epSq = flag === FLAG_DPAWN ? (this.turnWhite ? to + 8 : to - 8) : -1;

    // Update castling rights on king or rook move/capture
    if (from === 60) this.castle &= ~(CR_WK | CR_WQ);
    else if (from === 4) this.castle &= ~(CR_BK | CR_BQ);
    if (from === 63 || to === 63) this.castle &= ~CR_WK;
    if (from === 56 || to === 56) this.castle &= ~CR_WQ;
    if (from === 7 || to === 7) this.castle &= ~CR_BK;
    if (from === 0 || to === 0) this.castle &= ~CR_BQ;

    const wasWhite = this.turnWhite;
    this.turnWhite = !wasWhite;
    hi ^= Z_TURN_HI ^ Z_CASTLE_HI[this.castle] ^ Z_EP_HI[this.epSq >= 0 ? (this.epSq & 7) + 1 : 0];
    lo ^= Z_TURN_LO ^ Z_CASTLE_LO[this.castle] ^ Z_EP_LO[this.epSq >= 0 ? (this.epSq & 7) + 1 : 0];
    this.hashHi = hi >>> 0;
    this.hashLo = lo >>> 0;

    // Verify king not left in check
    const kingSq = wasWhite ? this.wkSq : this.bkSq;
    if (this.isSquareAttacked(kingSq, !wasWhite)) {
      this.unmakeMove(move, ply);
      return false;
    }
    return true;
  }

  unmakeMove(move: number, ply: number): void {
    const from = move & 63;
    const to = (move >> 6) & 63;
    const flag = (move >> 15) & 7;

    this.turnWhite = !this.turnWhite;
    this.b[from] = this.undoPiece[ply];
    this.b[to] = this.undoCap[ply];
    this.castle = this.undoCastle[ply];
    this.epSq = this.undoEp[ply];
    this.wkSq = this.undoWk[ply];
    this.bkSq = this.undoBk[ply];
    this.hashHi = this.undoHi[ply];
    this.hashLo = this.undoLo[ply];

    if (flag === FLAG_EP) {
      const capSq = this.turnWhite ? to + 8 : to - 8;
      this.b[capSq] = this.turnWhite ? BP : WP;
    } else if (flag === FLAG_CASTLE) {
      let rFrom = 0;
      let rTo = 0;
      if (to === 62) { rFrom = 63; rTo = 61; }
      else if (to === 58) { rFrom = 56; rTo = 59; }
      else if (to === 6) { rFrom = 7; rTo = 5; }
      else if (to === 2) { rFrom = 0; rTo = 3; }
      this.b[rFrom] = this.b[rTo];
      this.b[rTo] = EMPTY;
    }
  }

  makeNullMove(ply: number): void {
    this.undoEp[ply] = this.epSq;
    this.undoHi[ply] = this.hashHi;
    this.undoLo[ply] = this.hashLo;
    let hi = this.hashHi ^ Z_TURN_HI ^ Z_EP_HI[this.epSq >= 0 ? (this.epSq & 7) + 1 : 0];
    let lo = this.hashLo ^ Z_TURN_LO ^ Z_EP_LO[this.epSq >= 0 ? (this.epSq & 7) + 1 : 0];
    this.epSq = -1;
    hi ^= Z_EP_HI[0];
    lo ^= Z_EP_LO[0];
    this.hashHi = hi >>> 0;
    this.hashLo = lo >>> 0;
    this.turnWhite = !this.turnWhite;
  }

  unmakeNullMove(ply: number): void {
    this.turnWhite = !this.turnWhite;
    this.epSq = this.undoEp[ply];
    this.hashHi = this.undoHi[ply];
    this.hashLo = this.undoLo[ply];
  }

  generatePseudoMoves(ply: number, capturesOnly: boolean): number {
    const base = ply * MOVE_BUF_STRIDE;
    let count = 0;
    const b = this.b;
    const white = this.turnWhite;

    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (p === 0 || (white ? p < 0 : p > 0)) continue;

      const r = sq >> 3;
      const c = sq & 7;
      const abs = p > 0 ? p : -p;

      if (abs === 1) {
        // Pawn
        const dir = white ? -1 : 1;
        const startRow = white ? 6 : 1;
        const promoRow = white ? 0 : 7;
        const nr = r + dir;

        // Captures (and en passant)
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if ((nc & 7) !== nc) continue;
          const to = nr * 8 + nc;
          const target = b[to];
          if (target !== 0 && (white ? target < 0 : target > 0)) {
            const capAbs = target > 0 ? target : -target;
            if (nr === promoRow) {
              this.moveBuf[base + count++] = packMove(sq, to, 5, FLAG_NONE, capAbs);
              this.moveBuf[base + count++] = packMove(sq, to, 2, FLAG_NONE, capAbs);
            } else {
              this.moveBuf[base + count++] = packMove(sq, to, 0, FLAG_NONE, capAbs);
            }
          } else if (to === this.epSq) {
            this.moveBuf[base + count++] = packMove(sq, to, 0, FLAG_EP, 1);
          }
        }

        // Quiet pushes (plus push promotions)
        const fwd = nr * 8 + c;
        if (b[fwd] === 0) {
          if (nr === promoRow) {
            this.moveBuf[base + count++] = packMove(sq, fwd, 5, FLAG_NONE, 0);
            this.moveBuf[base + count++] = packMove(sq, fwd, 2, FLAG_NONE, 0);
          } else if (!capturesOnly) {
            this.moveBuf[base + count++] = packMove(sq, fwd, 0, FLAG_NONE, 0);
            if (r === startRow) {
              const fwd2 = (r + dir * 2) * 8 + c;
              if (b[fwd2] === 0) {
                this.moveBuf[base + count++] = packMove(sq, fwd2, 0, FLAG_DPAWN, 0);
              }
            }
          }
        }
      } else if (abs === 2) {
        // Knight
        for (let i = 0; i < 8; i++) {
          const nr = r + KNIGHT_DR[i];
          const nc = c + KNIGHT_DC[i];
          if ((nr & 7) !== nr || (nc & 7) !== nc) continue;
          const to = nr * 8 + nc;
          const target = b[to];
          if (target === 0) {
            if (!capturesOnly) this.moveBuf[base + count++] = packMove(sq, to);
          } else if (white ? target < 0 : target > 0) {
            this.moveBuf[base + count++] = packMove(sq, to, 0, FLAG_NONE, target > 0 ? target : -target);
          }
        }
      } else if (abs === 6) {
        // King
        for (let i = 0; i < 8; i++) {
          const nr = r + KING_DR[i];
          const nc = c + KING_DC[i];
          if ((nr & 7) !== nr || (nc & 7) !== nc) continue;
          const to = nr * 8 + nc;
          const target = b[to];
          if (target === 0) {
            if (!capturesOnly) this.moveBuf[base + count++] = packMove(sq, to);
          } else if (white ? target < 0 : target > 0) {
            this.moveBuf[base + count++] = packMove(sq, to, 0, FLAG_NONE, target > 0 ? target : -target);
          }
        }
        // Castling
        if (!capturesOnly) {
          if (white && sq === 60) {
            if (
              (this.castle & CR_WK) !== 0 &&
              b[61] === 0 &&
              b[62] === 0 &&
              b[63] === WR &&
              !this.isSquareAttacked(60, false) &&
              !this.isSquareAttacked(61, false) &&
              !this.isSquareAttacked(62, false)
            ) {
              this.moveBuf[base + count++] = packMove(60, 62, 0, FLAG_CASTLE, 0);
            }
            if (
              (this.castle & CR_WQ) !== 0 &&
              b[59] === 0 &&
              b[58] === 0 &&
              b[57] === 0 &&
              b[56] === WR &&
              !this.isSquareAttacked(60, false) &&
              !this.isSquareAttacked(59, false) &&
              !this.isSquareAttacked(58, false)
            ) {
              this.moveBuf[base + count++] = packMove(60, 58, 0, FLAG_CASTLE, 0);
            }
          } else if (!white && sq === 4) {
            if (
              (this.castle & CR_BK) !== 0 &&
              b[5] === 0 &&
              b[6] === 0 &&
              b[7] === BR &&
              !this.isSquareAttacked(4, true) &&
              !this.isSquareAttacked(5, true) &&
              !this.isSquareAttacked(6, true)
            ) {
              this.moveBuf[base + count++] = packMove(4, 6, 0, FLAG_CASTLE, 0);
            }
            if (
              (this.castle & CR_BQ) !== 0 &&
              b[3] === 0 &&
              b[2] === 0 &&
              b[1] === 0 &&
              b[0] === BR &&
              !this.isSquareAttacked(4, true) &&
              !this.isSquareAttacked(3, true) &&
              !this.isSquareAttacked(2, true)
            ) {
              this.moveBuf[base + count++] = packMove(4, 2, 0, FLAG_CASTLE, 0);
            }
          }
        }
      } else {
        // Sliding pieces (B=3, R=4, Q=5)
        const startD = abs === 3 ? 4 : 0;
        const endD = abs === 4 ? 4 : 8;
        for (let d = startD; d < endD; d++) {
          const dr = d < 4 ? ORTHO_DR[d] : DIAG_DR[d - 4];
          const dc = d < 4 ? ORTHO_DC[d] : DIAG_DC[d - 4];
          let nr = r + dr;
          let nc = c + dc;
          while ((nr & 7) === nr && (nc & 7) === nc) {
            const to = nr * 8 + nc;
            const target = b[to];
            if (target === 0) {
              if (!capturesOnly) this.moveBuf[base + count++] = packMove(sq, to);
            } else {
              if (white ? target < 0 : target > 0) {
                this.moveBuf[base + count++] = packMove(sq, to, 0, FLAG_NONE, target > 0 ? target : -target);
              }
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
      }
    }
    return count;
  }
}

function squareStrToIdx(sq: string): number {
  const c = sq.charCodeAt(0) - 97;
  const r = 56 - sq.charCodeAt(1);
  return r * 8 + c;
}

const _wPawnFiles = new Uint8Array(8);
const _bPawnFiles = new Uint8Array(8);
const _wAdvRow = new Int8Array(8);
const _bAdvRow = new Int8Array(8);

function evaluateFastBoard(fb: FastBoard, advancedPositional: boolean, sillyPresentOnly = false): number {
  const b = fb.b;
  let score = 0;
  let nonKingMaterial = 0;
  let whiteBishops = 0;
  let blackBishops = 0;

  _wPawnFiles.fill(0);
  _bPawnFiles.fill(0);
  _wAdvRow.fill(8);
  _bAdvRow.fill(-1);

  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (p === 0) continue;
    const abs = p > 0 ? p : -p;
    if (abs !== 1 && abs !== 6) nonKingMaterial += PIECE_VALUES[abs];
    if (abs === 3) {
      if (p > 0) whiteBishops++;
      else blackBishops++;
    } else if (abs === 1) {
      const r = sq >> 3;
      const c = sq & 7;
      if (p > 0) {
        _wPawnFiles[c]++;
        if (r < _wAdvRow[c]) _wAdvRow[c] = r;
      } else {
        _bPawnFiles[c]++;
        if (r > _bAdvRow[c]) _bAdvRow[c] = r;
      }
    }
  }

  const endgameWeight = Math.max(0, Math.min(1, 1 - nonKingMaterial / 4800));

  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (p === 0) continue;
    const isW = p > 0;
    const abs = isW ? p : -p;
    const r = sq >> 3;
    const c = sq & 7;

    if (sillyPresentOnly) {
      const naiveVal = PIECE_VALUES[abs] + (c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 6 : 0);
      score += isW ? naiveVal : -naiveVal;
      continue;
    }

    const pstSq = isW ? sq : (7 - r) * 8 + c;
    let pst = 0;
    switch (abs) {
      case 1: pst = PAWN_PST[pstSq]; break;
      case 2: pst = KNIGHT_PST[pstSq]; break;
      case 3: pst = BISHOP_PST[pstSq]; break;
      case 4: pst = ROOK_PST[pstSq]; break;
      case 5: pst = QUEEN_PST[pstSq]; break;
      case 6:
        pst = Math.round(KING_MID_PST[pstSq] * (1 - endgameWeight) + KING_END_PST[pstSq] * endgameWeight);
        break;
    }

    let val = PIECE_VALUES[abs] + pst;

    if (advancedPositional) {
      if (abs === 1) {
        const leftC = c > 0 ? c - 1 : 0;
        const rightC = c < 7 ? c + 1 : 7;
        if (isW) {
          let blocked = false;
          for (let fc = leftC; fc <= rightC; fc++) {
            if (_bAdvRow[fc] !== -1 && _bAdvRow[fc] < r) { blocked = true; break; }
          }
          if (!blocked) val += Math.round(PASSED_PAWN_BONUS[7 - r] * (0.65 + endgameWeight * 0.7));
        } else {
          let blocked = false;
          for (let fc = leftC; fc <= rightC; fc++) {
            if (_wAdvRow[fc] !== 8 && _wAdvRow[fc] > r) { blocked = true; break; }
          }
          if (!blocked) val += Math.round(PASSED_PAWN_BONUS[r] * (0.65 + endgameWeight * 0.7));
        }
      } else if (abs === 2) {
        if (isW && r >= 2 && r <= 3) {
          if ((c > 0 && b[(r + 1) * 8 + (c - 1)] === WP) || (c < 7 && b[(r + 1) * 8 + (c + 1)] === WP)) {
            val += 24;
          }
        } else if (!isW && r >= 4 && r <= 5) {
          if ((c > 0 && b[(r - 1) * 8 + (c - 1)] === BP) || (c < 7 && b[(r - 1) * 8 + (c + 1)] === BP)) {
            val += 24;
          }
        }
      } else if (abs === 4) {
        const isOpen = _wPawnFiles[c] === 0 && _bPawnFiles[c] === 0;
        const isSemi = isW ? _wPawnFiles[c] === 0 : _bPawnFiles[c] === 0;
        if (isOpen) val += 26;
        else if (isSemi) val += 13;
        if ((isW && r === 1) || (!isW && r === 6)) val += 32;
      }
    }

    score += isW ? val : -val;
  }

  if (advancedPositional && !sillyPresentOnly) {
    if (whiteBishops >= 2) score += 42;
    if (blackBishops >= 2) score -= 42;

    for (let c = 0; c < 8; c++) {
      if (_wPawnFiles[c] > 1) score -= (_wPawnFiles[c] - 1) * 16;
      if (_bPawnFiles[c] > 1) score += (_bPawnFiles[c] - 1) * 16;
      if (_wPawnFiles[c] > 0) {
        if ((c === 0 || _wPawnFiles[c - 1] === 0) && (c === 7 || _wPawnFiles[c + 1] === 0)) score -= 14;
      }
      if (_bPawnFiles[c] > 0) {
        if ((c === 0 || _bPawnFiles[c - 1] === 0) && (c === 7 || _bPawnFiles[c + 1] === 0)) score += 14;
      }
    }

    // Middlegame King Safety (pawn shield & open files around king)
    if (endgameWeight < 0.72) {
      const shieldW = 1 - endgameWeight;
      const wKr = fb.wkSq >> 3;
      const wKc = fb.wkSq & 7;
      const bKr = fb.bkSq >> 3;
      const bKc = fb.bkSq & 7;
      let wShield = 0;
      let bShield = 0;
      for (let dc = -1; dc <= 1; dc++) {
        const wc = wKc + dc;
        if (wc >= 0 && wc < 8) {
          if (wKr > 0 && b[(wKr - 1) * 8 + wc] === WP) wShield += 14;
          else if (wKr > 1 && b[(wKr - 2) * 8 + wc] === WP) wShield += 7;
          if (_wPawnFiles[wc] === 0) wShield -= 16;
        }
        const bc = bKc + dc;
        if (bc >= 0 && bc < 8) {
          if (bKr < 7 && b[(bKr + 1) * 8 + bc] === BP) bShield += 14;
          else if (bKr < 6 && b[(bKr + 2) * 8 + bc] === BP) bShield += 7;
          if (_bPawnFiles[bc] === 0) bShield -= 16;
        }
      }
      score += Math.round((wShield - bShield) * shieldW);
    }

    score += fb.turnWhite ? 12 : -12;
  }

  return score;
}

const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

interface TTEntry {
  depth: number;
  score: number;
  flag: number;
  bestMove: number;
}

interface SearchContext {
  deadline: number;
  aborted: boolean;
  nodes: number;
  advancedEval: boolean;
  useNullMove: boolean;
  useLmr: boolean;
  tt: Map<number, TTEntry>;
  killers: Int32Array; // MAX_PLY * 2
  history: Int32Array; // 4096
}

function scoreMovesAtPly(
  fb: FastBoard,
  ply: number,
  count: number,
  ctx: SearchContext,
  ttBestMove: number,
): void {
  const base = ply * MOVE_BUF_STRIDE;
  const k0 = ctx.killers[ply * 2];
  const k1 = ctx.killers[ply * 2 + 1];

  for (let i = 0; i < count; i++) {
    const m = fb.moveBuf[base + i];
    if ((m & 0x7fff) === (ttBestMove & 0x7fff) && ttBestMove !== 0) {
      fb.scoreBuf[base + i] = 2000000;
      continue;
    }
    const capAbs = (m >> 18) & 7;
    const promo = (m >> 12) & 7;
    let s = 0;
    if (capAbs !== 0) {
      const from = m & 63;
      const attackerAbs = Math.abs(fb.b[from]);
      s += 100000 + PIECE_VALUES[capAbs] * 16 - PIECE_VALUES[attackerAbs];
    }
    if (promo !== 0) {
      s += 90000 + PIECE_VALUES[promo];
    }
    if (capAbs === 0 && promo === 0) {
      const ft = m & 4095;
      if (ft === k0) s += 8000;
      else if (ft === k1) s += 7000;
      else s += ctx.history[ft];
    }
    fb.scoreBuf[base + i] = s;
  }
}

function pickNextMove(fb: FastBoard, ply: number, startIdx: number, count: number): number {
  const base = ply * MOVE_BUF_STRIDE;
  let bestIdx = startIdx;
  let bestScore = fb.scoreBuf[base + startIdx];
  for (let j = startIdx + 1; j < count; j++) {
    const sc = fb.scoreBuf[base + j];
    if (sc > bestScore) {
      bestScore = sc;
      bestIdx = j;
    }
  }
  if (bestIdx !== startIdx) {
    const tmpM = fb.moveBuf[base + startIdx];
    const tmpS = fb.scoreBuf[base + startIdx];
    fb.moveBuf[base + startIdx] = fb.moveBuf[base + bestIdx];
    fb.scoreBuf[base + startIdx] = fb.scoreBuf[base + bestIdx];
    fb.moveBuf[base + bestIdx] = tmpM;
    fb.scoreBuf[base + bestIdx] = tmpS;
  }
  return fb.moveBuf[base + startIdx];
}

function quiescence(
  fb: FastBoard,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchContext,
  qDepth = 0,
): number {
  ctx.nodes++;
  if ((ctx.nodes & 2047) === 0 && Date.now() >= ctx.deadline) {
    ctx.aborted = true;
    return evaluateFastBoard(fb, ctx.advancedEval);
  }
  if (ply >= MAX_PLY - 2) {
    return evaluateFastBoard(fb, ctx.advancedEval);
  }

  const maxWhite = fb.turnWhite;
  const inCheck = fb.inCheck();

  if (inCheck && qDepth < 3) {
    const count = fb.generatePseudoMoves(ply, false);
    scoreMovesAtPly(fb, ply, count, ctx, 0);
    let legalCount = 0;
    let best = maxWhite ? -Infinity : Infinity;

    for (let i = 0; i < count; i++) {
      const m = pickNextMove(fb, ply, i, count);
      if (!fb.makeMove(m, ply)) continue;
      legalCount++;
      const sc = quiescence(fb, alpha, beta, ply + 1, ctx, qDepth + 1);
      fb.unmakeMove(m, ply);
      if (ctx.aborted) return best;

      if (maxWhite) {
        if (sc > best) best = sc;
        if (sc >= beta) return best;
        if (sc > alpha) alpha = sc;
      } else {
        if (sc < best) best = sc;
        if (sc <= alpha) return best;
        if (sc < beta) beta = sc;
      }
    }
    if (legalCount === 0) {
      return maxWhite ? -MATE_SCORE + ply : MATE_SCORE - ply;
    }
    return best;
  }

  const standPat = evaluateFastBoard(fb, ctx.advancedEval);
  if (qDepth >= 4) return standPat;

  if (maxWhite) {
    if (standPat >= beta) return standPat;
    if (alpha < standPat) alpha = standPat;
  } else {
    if (standPat <= alpha) return standPat;
    if (beta > standPat) beta = standPat;
  }

  let best = standPat;
  const count = fb.generatePseudoMoves(ply, true);
  scoreMovesAtPly(fb, ply, count, ctx, 0);

  for (let i = 0; i < count; i++) {
    const m = pickNextMove(fb, ply, i, count);
    const capAbs = (m >> 18) & 7;
    const promo = (m >> 12) & 7;

    if (promo === 0 && capAbs !== 0) {
      if (maxWhite && standPat + PIECE_VALUES[capAbs] + 200 < alpha) continue;
      if (!maxWhite && standPat - PIECE_VALUES[capAbs] - 200 > beta) continue;
    }

    if (!fb.makeMove(m, ply)) continue;
    const sc = quiescence(fb, alpha, beta, ply + 1, ctx, qDepth + 1);
    fb.unmakeMove(m, ply);
    if (ctx.aborted) return best;

    if (maxWhite) {
      if (sc > best) best = sc;
      if (sc >= beta) return best;
      if (sc > alpha) alpha = sc;
    } else {
      if (sc < best) best = sc;
      if (sc <= alpha) return best;
      if (sc < beta) beta = sc;
    }
  }

  return best;
}

function alphabeta(
  fb: FastBoard,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchContext,
  useQuiescence: boolean,
  allowNull: boolean,
): number {
  ctx.nodes++;
  if ((ctx.nodes & 2047) === 0 && Date.now() >= ctx.deadline) {
    ctx.aborted = true;
    return evaluateFastBoard(fb, ctx.advancedEval);
  }
  if (ply >= MAX_PLY - 2) {
    return evaluateFastBoard(fb, ctx.advancedEval);
  }

  const hashKey = fb.getHashKey();
  fb.pathKeys[ply] = hashKey;
  for (let p = ply - 2; p >= 0; p -= 2) {
    if (fb.pathKeys[p] === hashKey) return 0;
  }

  const maxWhite = fb.turnWhite;
  const inCheck = fb.inCheck();
  const effectiveDepth = inCheck && depth === 0 ? 1 : depth;

  if (effectiveDepth <= 0) {
    return useQuiescence
      ? quiescence(fb, alpha, beta, ply, ctx)
      : evaluateFastBoard(fb, ctx.advancedEval);
  }

  const origAlpha = alpha;
  const origBeta = beta;
  const cached = ctx.tt.get(hashKey);
  if (cached && cached.depth >= effectiveDepth) {
    let ttScore = cached.score;
    if (ttScore > MATE_THRESHOLD) ttScore -= ply;
    else if (ttScore < -MATE_THRESHOLD) ttScore += ply;

    if (cached.flag === TT_EXACT) return ttScore;
    if (cached.flag === TT_LOWER && ttScore > alpha) alpha = ttScore;
    else if (cached.flag === TT_UPPER && ttScore < beta) beta = ttScore;
    if (alpha >= beta) return ttScore;
  }

  // Null Move Pruning (O(1), skip when in check or very low material)
  if (ctx.useNullMove && allowNull && !inCheck && effectiveDepth >= 3) {
    const staticEval = evaluateFastBoard(fb, ctx.advancedEval);
    if ((maxWhite && staticEval >= beta) || (!maxWhite && staticEval <= alpha)) {
      const R = effectiveDepth >= 6 ? 3 : 2;
      fb.makeNullMove(ply);
      const nullScore = alphabeta(fb, effectiveDepth - 1 - R, alpha, beta, ply + 1, ctx, useQuiescence, false);
      fb.unmakeNullMove(ply);
      if (ctx.aborted) return staticEval;
      if (maxWhite && nullScore >= beta) return beta;
      if (!maxWhite && nullScore <= alpha) return alpha;
    }
  }

  // Futility pruning at frontier nodes
  if (effectiveDepth === 1 && !inCheck && ctx.advancedEval) {
    const staticEval = evaluateFastBoard(fb, true);
    if (maxWhite && staticEval + 300 <= alpha) {
      return quiescence(fb, alpha, beta, ply, ctx);
    }
    if (!maxWhite && staticEval - 300 >= beta) {
      return quiescence(fb, alpha, beta, ply, ctx);
    }
  }

  const count = fb.generatePseudoMoves(ply, false);
  scoreMovesAtPly(fb, ply, count, ctx, cached?.bestMove ?? 0);

  let legalCount = 0;
  let best = maxWhite ? -Infinity : Infinity;
  let bestMove = 0;

  for (let i = 0; i < count; i++) {
    const m = pickNextMove(fb, ply, i, count);
    if (!fb.makeMove(m, ply)) continue;

    const capAbs = (m >> 18) & 7;
    const promo = (m >> 12) & 7;
    const isQuiet = capAbs === 0 && promo === 0;
    let val: number;

    if (legalCount === 0) {
      val = alphabeta(fb, effectiveDepth - 1, alpha, beta, ply + 1, ctx, useQuiescence, true);
    } else {
      const reduce =
        ctx.useLmr && !inCheck && isQuiet && effectiveDepth >= 3 && legalCount >= 3 && !fb.inCheck()
          ? effectiveDepth >= 6 && legalCount >= 10
            ? 2
            : 1
          : 0;

      if (maxWhite) {
        val = alphabeta(fb, effectiveDepth - 1 - reduce, alpha, alpha + 1, ply + 1, ctx, useQuiescence, true);
        if (!ctx.aborted && val > alpha && (reduce > 0 || val < beta)) {
          val = alphabeta(fb, effectiveDepth - 1, alpha, beta, ply + 1, ctx, useQuiescence, true);
        }
      } else {
        val = alphabeta(fb, effectiveDepth - 1 - reduce, beta - 1, beta, ply + 1, ctx, useQuiescence, true);
        if (!ctx.aborted && val < beta && (reduce > 0 || val > alpha)) {
          val = alphabeta(fb, effectiveDepth - 1, alpha, beta, ply + 1, ctx, useQuiescence, true);
        }
      }
    }

    fb.unmakeMove(m, ply);
    legalCount++;

    if (ctx.aborted) {
      if (legalCount === 1 && bestMove === 0) return evaluateFastBoard(fb, ctx.advancedEval);
      return best;
    }

    if (maxWhite) {
      if (val > best) {
        best = val;
        bestMove = m;
      }
      if (val > alpha) alpha = val;
      if (beta <= alpha) {
        if (isQuiet) {
          const ft = m & 4095;
          if (ctx.killers[ply * 2] !== ft) {
            ctx.killers[ply * 2 + 1] = ctx.killers[ply * 2];
            ctx.killers[ply * 2] = ft;
          }
          ctx.history[ft] = Math.min(4000, ctx.history[ft] + effectiveDepth * effectiveDepth);
        }
        break;
      }
    } else {
      if (val < best) {
        best = val;
        bestMove = m;
      }
      if (val < beta) beta = val;
      if (beta <= alpha) {
        if (isQuiet) {
          const ft = m & 4095;
          if (ctx.killers[ply * 2] !== ft) {
            ctx.killers[ply * 2 + 1] = ctx.killers[ply * 2];
            ctx.killers[ply * 2] = ft;
          }
          ctx.history[ft] = Math.min(4000, ctx.history[ft] + effectiveDepth * effectiveDepth);
        }
        break;
      }
    }
  }

  if (legalCount === 0) {
    if (inCheck) return maxWhite ? -MATE_SCORE + ply : MATE_SCORE - ply;
    return 0;
  }

  if (ctx.tt.size < 250000 && bestMove !== 0) {
    const flag = best <= origAlpha ? TT_UPPER : best >= origBeta ? TT_LOWER : TT_EXACT;
    let stored = best;
    if (stored > MATE_THRESHOLD) stored += ply;
    else if (stored < -MATE_THRESHOLD) stored -= ply;
    ctx.tt.set(hashKey, { depth: effectiveDepth, score: stored, flag, bestMove });
  }

  return best;
}

export interface EloSearchProfile {
  elo: number;
  maxDepth: number;
  budgetMs: number;
  useQuiescence: boolean;
  advancedEval: boolean;
  useOpeningBook: boolean;
  useNullMove: boolean;
  useLmr: boolean;
  sillyPresentOnly: boolean;
  blunderAmplitudeCp: number;
}

export function getEloSearchProfile(rawElo: number): EloSearchProfile {
  const elo = clampElo(rawElo);

  if (elo < 250) {
    // 50 - 249 Elo: Present-only (1 ply), silly / naive choices, zero future planning
    const t = (250 - elo) / 200;
    return {
      elo,
      maxDepth: 1,
      budgetMs: 25,
      useQuiescence: false,
      advancedEval: false,
      useOpeningBook: false,
      useNullMove: false,
      useLmr: false,
      sillyPresentOnly: true,
      blunderAmplitudeCp: Math.round(110 + t * 240),
    };
  }

  if (elo < 700) {
    const t = (700 - elo) / 450;
    return {
      elo,
      maxDepth: elo < 420 ? 1 : 2,
      budgetMs: 45,
      useQuiescence: false,
      advancedEval: false,
      useOpeningBook: false,
      useNullMove: false,
      useLmr: false,
      sillyPresentOnly: false,
      blunderAmplitudeCp: Math.round(35 + t * 95),
    };
  }

  if (elo < 1400) {
    const t = (1400 - elo) / 700;
    return {
      elo,
      maxDepth: elo < 1050 ? 2 : 3,
      budgetMs: 110,
      useQuiescence: elo >= 1000,
      advancedEval: elo >= 1000,
      useOpeningBook: false,
      useNullMove: false,
      useLmr: false,
      sillyPresentOnly: false,
      blunderAmplitudeCp: Math.round(t * 42),
    };
  }

  if (elo < 2400) {
    const t = Math.max(0, (1950 - elo) / 550);
    return {
      elo,
      maxDepth: elo < 1900 ? 3 : 4,
      budgetMs: elo < 1900 ? 180 : 280,
      useQuiescence: true,
      advancedEval: true,
      useOpeningBook: elo >= 1600,
      useNullMove: elo >= 2100,
      useLmr: elo >= 2100,
      sillyPresentOnly: false,
      blunderAmplitudeCp: Math.round(t * 18),
    };
  }

  if (elo < 3800) {
    return {
      elo,
      maxDepth: elo < 3000 ? 5 : 6,
      budgetMs: elo < 3000 ? 450 : 700,
      useQuiescence: true,
      advancedEval: true,
      useOpeningBook: true,
      useNullMove: true,
      useLmr: true,
      sillyPresentOnly: false,
      blunderAmplitudeCp: 0,
    };
  }

  // 3800 - 5000 Elo: Hyper-GM Supercomputer (> Carlsen / Kasparov / Nakamura)
  return {
    elo,
    maxDepth: elo >= 4600 ? 8 : 7,
    budgetMs: elo >= 4600 ? 1100 : 850,
    useQuiescence: true,
    advancedEval: true,
    useOpeningBook: true,
    useNullMove: true,
    useLmr: true,
    sillyPresentOnly: false,
    blunderAmplitudeCp: 0,
  };
}

export interface AiAnalysisResult {
  move: { from: string; to: string; promotion?: PieceType } | null;
  depthReached: number;
  nodes: number;
  fromBook: boolean;
  profile: EloSearchProfile;
}

function chessMoveToFastMove(m: Move): number {
  const from = squareStrToIdx(m.from);
  const to = squareStrToIdx(m.to);
  const promo = m.promotion ? CHAR_TO_ABS[m.promotion] : 0;
  let flag = FLAG_NONE;
  if (m.flags.includes('e')) flag = FLAG_EP;
  else if (m.flags.includes('k') || m.flags.includes('q')) flag = FLAG_CASTLE;
  else if (m.flags.includes('b')) flag = FLAG_DPAWN;
  const capAbs = m.captured ? CHAR_TO_ABS[m.captured] : 0;
  return packMove(from, to, promo, flag, capAbs);
}

export function chooseAiMoveWithAnalysis(
  fen: string,
  rawElo: number = 1500,
): AiAnalysisResult {
  const profile = getEloSearchProfile(rawElo);
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });

  if (legal.length === 0) {
    return { move: null, depthReached: 0, nodes: 0, fromBook: false, profile };
  }

  // Grandmaster Opening Book lookup for high Elo
  if (profile.useOpeningBook) {
    const bookMoves = GM_OPENING_BOOK.get(normalizeFenKey(fen));
    if (bookMoves && bookMoves.length > 0) {
      const pick = bookMoves[Math.floor(Math.random() * bookMoves.length)];
      const from = pick.slice(0, 2);
      const to = pick.slice(2, 4);
      const promotion = (pick.slice(4, 5) || undefined) as PieceType | undefined;
      if (legal.some((m) => m.from === from && m.to === to)) {
        return {
          move: { from, to, promotion },
          depthReached: profile.maxDepth,
          nodes: 1,
          fromBook: true,
          profile,
        };
      }
    }
  }

  const fb = FastBoard.fromChess(chess);
  const maximizingWhite = fb.turnWhite;

  // Low Elo (50 - 249): Present-only, short-sighted & naive play
  if (profile.sillyPresentOnly) {
    const scoredPresent = legal.map((move) => {
      const fm = chessMoveToFastMove(move);
      fb.makeMove(fm, 0);
      let s: number;
      if (fb.inCheck() && fb.generatePseudoMoves(1, false) === 0) {
        s = maximizingWhite ? 600 : -600;
      } else {
        s = evaluateFastBoard(fb, false, true);
      }
      fb.unmakeMove(fm, 0);
      const jitter = (Math.random() * 2 - 1) * profile.blunderAmplitudeCp;
      const sillyImpulse =
        profile.elo <= 120 && !move.captured && (move.piece === 'p' || move.piece === 'k')
          ? (maximizingWhite ? 40 : -40)
          : 0;
      return { move, score: s + jitter + sillyImpulse };
    });

    scoredPresent.sort((a, b) =>
      maximizingWhite ? b.score - a.score : a.score - b.score,
    );

    const poolSize = profile.elo <= 100 ? Math.min(scoredPresent.length, 4) : Math.min(scoredPresent.length, 2);
    const picked = scoredPresent[Math.floor(Math.random() * poolSize)].move;
    return {
      move: { from: picked.from, to: picked.to, promotion: picked.promotion },
      depthReached: 1,
      nodes: legal.length,
      fromBook: false,
      profile,
    };
  }

  const ctx: SearchContext = {
    deadline: Date.now() + profile.budgetMs,
    aborted: false,
    nodes: 0,
    advancedEval: profile.advancedEval,
    useNullMove: profile.useNullMove,
    useLmr: profile.useLmr,
    tt: new Map(),
    killers: new Int32Array(MAX_PLY * 2).fill(-1),
    history: new Int32Array(4096),
  };

  const rootPairs = legal.map((move) => ({
    move,
    fastMove: chessMoveToFastMove(move),
  }));

  let bestScored: { move: Move; fastMove: number; score: number; isExact: boolean }[] = [];
  let depthReached = 0;

  for (let depth = 1; depth <= profile.maxDepth; depth++) {
    const rootHash = fb.getHashKey();
    fb.pathKeys[0] = rootHash;
    const ttEntry = ctx.tt.get(rootHash);
    const ttBest = ttEntry?.bestMove ?? 0;

    // Order root moves: TT best move -> MVV-LVA captures -> checks -> previous best order
    const ordered = [...rootPairs].sort((a, b) => {
      if (ttBest !== 0) {
        const aMatch = (a.fastMove & 0x7fff) === (ttBest & 0x7fff);
        const bMatch = (b.fastMove & 0x7fff) === (ttBest & 0x7fff);
        if (aMatch !== bMatch) return aMatch ? -1 : 1;
      }
      const aCap = a.move.captured ? PIECE_VALUES[CHAR_TO_ABS[a.move.captured]] * 16 - PIECE_VALUES[CHAR_TO_ABS[a.move.piece]] : 0;
      const bCap = b.move.captured ? PIECE_VALUES[CHAR_TO_ABS[b.move.captured]] * 16 - PIECE_VALUES[CHAR_TO_ABS[b.move.piece]] : 0;
      const aProm = a.move.promotion ? PIECE_VALUES[CHAR_TO_ABS[a.move.promotion]] * 10 : 0;
      const bProm = b.move.promotion ? PIECE_VALUES[CHAR_TO_ABS[b.move.promotion]] * 10 : 0;
      const aChk = a.move.san.includes('+') ? 1500 : 0;
      const bChk = b.move.san.includes('+') ? 1500 : 0;
      return bCap + bProm + bChk - (aCap + aProm + aChk);
    });

    const currentScored: { move: Move; fastMove: number; score: number; isExact: boolean }[] = [];
    let alpha = -Infinity;
    let beta = Infinity;
    const useRootPvs = profile.blunderAmplitudeCp === 0;

    for (let i = 0; i < ordered.length; i++) {
      const { move, fastMove } = ordered[i];
      fb.makeMove(fastMove, 0);

      let score: number;
      let isExact = true;

      if (!useRootPvs || i === 0) {
        score = alphabeta(
          fb,
          depth - 1,
          useRootPvs ? alpha : -Infinity,
          useRootPvs ? beta : Infinity,
          1,
          ctx,
          profile.useQuiescence,
          true,
        );
      } else {
        if (maximizingWhite) {
          score = alphabeta(fb, depth - 1, alpha, alpha + 1, 1, ctx, profile.useQuiescence, true);
          if (!ctx.aborted && score > alpha) {
            score = alphabeta(fb, depth - 1, alpha, beta, 1, ctx, profile.useQuiescence, true);
          } else {
            isExact = false;
          }
        } else {
          score = alphabeta(fb, depth - 1, beta - 1, beta, 1, ctx, profile.useQuiescence, true);
          if (!ctx.aborted && score < beta) {
            score = alphabeta(fb, depth - 1, alpha, beta, 1, ctx, profile.useQuiescence, true);
          } else {
            isExact = false;
          }
        }
      }

      fb.unmakeMove(fastMove, 0);
      if (ctx.aborted) break;

      currentScored.push({ move, fastMove, score, isExact });
      if (useRootPvs && isExact) {
        if (maximizingWhite && score > alpha) alpha = score;
        else if (!maximizingWhite && score < beta) beta = score;
      }
    }

    if (!ctx.aborted && currentScored.length > 0) {
      currentScored.sort((a, b) => {
        const diff = maximizingWhite ? b.score - a.score : a.score - b.score;
        if (diff !== 0) return diff;
        return Number(b.isExact) - Number(a.isExact);
      });
      bestScored = currentScored;
      depthReached = depth;
      const top = currentScored[0];
      ctx.tt.set(rootHash, {
        depth,
        score: top.score,
        flag: TT_EXACT,
        bestMove: top.fastMove,
      });
      if (Math.abs(top.score) > MATE_THRESHOLD) break;
    } else {
      break;
    }
  }

  if (bestScored.length === 0) {
    const fallback = legal[0];
    return {
      move: { from: fallback.from, to: fallback.to, promotion: fallback.promotion },
      depthReached: Math.max(depthReached, 1),
      nodes: ctx.nodes,
      fromBook: false,
      profile,
    };
  }

  if (profile.blunderAmplitudeCp > 0 && bestScored.length > 1) {
    const jittered = bestScored.map((item) => ({
      move: item.move,
      score: item.score + (Math.random() * 2 - 1) * profile.blunderAmplitudeCp,
    }));
    jittered.sort((a, b) => (maximizingWhite ? b.score - a.score : a.score - b.score));
    const chosen = jittered[0].move;
    return {
      move: { from: chosen.from, to: chosen.to, promotion: chosen.promotion },
      depthReached,
      nodes: ctx.nodes,
      fromBook: false,
      profile,
    };
  }

  const bestScore = bestScored[0].score;
  const tied = bestScored.filter((s) => s.isExact && s.score === bestScore);
  const chosen = (tied.length > 0 ? tied[Math.floor(Math.random() * tied.length)] : bestScored[0]).move;

  return {
    move: {
      from: chosen.from,
      to: chosen.to,
      promotion: chosen.promotion,
    },
    depthReached,
    nodes: ctx.nodes,
    fromBook: false,
    profile,
  };
}

export function chooseAiMove(
  fen: string,
  rawElo: number = 1500,
): { from: string; to: string; promotion?: PieceType } | null {
  return chooseAiMoveWithAnalysis(fen, rawElo).move;
}

export type { Color };
export { ABS_TO_CHAR };
