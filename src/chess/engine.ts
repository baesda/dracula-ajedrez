import { Chess, type Square } from 'chess.js';
import type {
  ChessPieceInfo,
  GameOutcomeReason,
  GameSnapshot,
  LegalMoveTarget,
  MoveRecord,
  PieceType,
  TeamColor,
} from './types';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const STARTING_COUNTS: Record<PieceType, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

export function squareToCoords(square: string): { file: number; rank: number } {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = parseInt(square[1], 10) - 1;
  return { file, rank };
}

export function coordsToSquare(file: number, rank: number): string {
  return `${FILES[file]}${rank + 1}`;
}

export function squareToWorld(square: string, tileSize = 1.0): { x: number; z: number } {
  const { file, rank } = squareToCoords(square);
  return {
    x: (file - 3.5) * tileSize,
    z: (3.5 - rank) * tileSize,
  };
}

export class DraculaChessEngine {
  private chess: Chess;
  private moveHistory: MoveRecord[] = [];
  private forcedWinner: TeamColor | null = null;
  private forcedReason: GameOutcomeReason | null = null;

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
  }

  reset(): void {
    this.chess.reset();
    this.moveHistory = [];
    this.forcedWinner = null;
    this.forcedReason = null;
  }

  loadFen(fen: string): void {
    this.chess.load(fen);
  }

  getFen(): string {
    return this.chess.fen();
  }

  getTurn(): TeamColor {
    return this.chess.turn();
  }

  getPieces(): ChessPieceInfo[] {
    const board = this.chess.board();
    const pieces: ChessPieceInfo[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        if (cell) {
          pieces.push({
            id: `${cell.color}-${cell.type}-${cell.square}`,
            square: cell.square,
            type: cell.type,
            color: cell.color,
          });
        }
      }
    }
    return pieces;
  }

  getLegalMovesFrom(square: string): LegalMoveTarget[] {
    if (this.isGameOver()) return [];
    const verboseMoves = this.chess.moves({
      square: square as Square,
      verbose: true,
    });
    // Deduplicate promotion targets into a single target square entry (UI will prompt promotion choice)
    const seenTargets = new Set<string>();
    const targets: LegalMoveTarget[] = [];
    for (const m of verboseMoves) {
      if (seenTargets.has(m.to)) continue;
      seenTargets.add(m.to);
      targets.push({
        from: m.from,
        to: m.to,
        flags: m.flags,
        isCapture: m.isCapture() || m.isEnPassant(),
        isCastle: m.isKingsideCastle() || m.isQueensideCastle(),
        isEnPassant: m.isEnPassant(),
        isPromotion: m.isPromotion(),
        san: m.san,
      });
    }
    return targets;
  }

  isPromotionMove(from: string, to: string): boolean {
    const moves = this.chess.moves({ square: from as Square, verbose: true });
    return moves.some((m) => m.to === to && m.isPromotion());
  }

  makeMove(from: string, to: string, promotion?: PieceType): MoveRecord | null {
    if (this.isGameOver()) return null;
    try {
      const move = this.chess.move({
        from: from as Square,
        to: to as Square,
        promotion: promotion ?? 'q',
      });
      if (!move) return null;
      const record: MoveRecord = {
        from: move.from,
        to: move.to,
        san: move.san,
        color: move.color,
        piece: move.piece,
        captured: move.captured,
        promotion: move.promotion,
        fen: this.chess.fen(),
      };
      this.moveHistory.push(record);
      return record;
    } catch {
      return null;
    }
  }

  undoLastMove(): MoveRecord | null {
    if (this.forcedReason) return null;
    const undone = this.chess.undo();
    if (!undone) return null;
    return this.moveHistory.pop() ?? null;
  }

  resign(loser: TeamColor): void {
    if (this.isGameOver()) return;
    this.forcedWinner = loser === 'w' ? 'b' : 'w';
    this.forcedReason = 'resignation';
  }

  setOpponentLeft(winner: TeamColor): void {
    if (this.isGameOver()) return;
    this.forcedWinner = winner;
    this.forcedReason = 'opponent_left';
  }

  setTimeoutLoss(loser: TeamColor): void {
    if (this.isGameOver()) return;
    this.forcedWinner = loser === 'w' ? 'b' : 'w';
    this.forcedReason = 'timeout';
  }

  isGameOver(): boolean {
    return this.forcedReason !== null || this.chess.isGameOver();
  }

  getCapturedPieces(): { capturedByRed: PieceType[]; capturedByBlack: PieceType[] } {
    const onBoardRed: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    const onBoardBlack: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };

    for (const piece of this.getPieces()) {
      if (piece.color === 'w') onBoardRed[piece.type]++;
      else onBoardBlack[piece.type]++;
    }

    const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
    const capturedByRed: PieceType[] = [];
    const capturedByBlack: PieceType[] = [];

    for (const type of order) {
      const lostBlack = Math.max(0, STARTING_COUNTS[type] - onBoardBlack[type]);
      for (let i = 0; i < lostBlack; i++) capturedByRed.push(type);

      const lostRed = Math.max(0, STARTING_COUNTS[type] - onBoardRed[type]);
      for (let i = 0; i < lostRed; i++) capturedByBlack.push(type);
    }

    return { capturedByRed, capturedByBlack };
  }

  getSnapshot(): GameSnapshot {
    const isCheckmate = this.chess.isCheckmate();
    const isStalemate = this.chess.isStalemate();
    const isThreefold = this.chess.isThreefoldRepetition();
    const isInsufficient = this.chess.isInsufficientMaterial();
    const isDraw = this.chess.isDraw();

    let reason: GameOutcomeReason | null = this.forcedReason;
    let winner: TeamColor | null = this.forcedWinner;

    if (!reason) {
      if (isCheckmate) {
        reason = 'checkmate';
        winner = this.chess.turn() === 'w' ? 'b' : 'w';
      } else if (isStalemate) {
        reason = 'stalemate';
      } else if (isThreefold) {
        reason = 'threefold';
      } else if (isInsufficient) {
        reason = 'insufficient';
      } else if (isDraw) {
        reason = 'fifty_moves';
      }
    }

    const last = this.moveHistory[this.moveHistory.length - 1] ?? null;
    const { capturedByRed, capturedByBlack } = this.getCapturedPieces();

    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      inCheck: this.chess.inCheck(),
      isCheckmate,
      isStalemate,
      isDraw,
      isGameOver: this.isGameOver(),
      winner,
      reason,
      moveNumber: Math.floor(this.moveHistory.length / 2) + 1,
      lastMove: last ? { from: last.from, to: last.to, san: last.san } : null,
      capturedByRed,
      capturedByBlack,
      history: [...this.moveHistory],
    };
  }
}
