export type TeamColor = 'w' | 'b';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type GameMode = '1p' | '2p';

export const MIN_AI_ELO = 50;
export const MAX_AI_ELO = 5000;

export type AppScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export interface ChessPieceInfo {
  id: string;
  square: string;
  type: PieceType;
  color: TeamColor;
}

export interface LegalMoveTarget {
  from: string;
  to: string;
  flags: string;
  isCapture: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
  isPromotion: boolean;
  san: string;
}

export interface MoveRecord {
  from: string;
  to: string;
  san: string;
  color: TeamColor;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  fen: string;
}

export type TimeControlMinutes = 10 | 15 | 30;

export interface ClockState {
  initialMinutes: TimeControlMinutes;
  wRemainingMs: number;
  bRemainingMs: number;
  activeTurn: TeamColor | null;
  turnStartedAtMs: number;
  serverNowMs: number;
}

export type GameOutcomeReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold'
  | 'insufficient'
  | 'fifty_moves'
  | 'resignation'
  | 'opponent_left'
  | 'timeout';

export interface GameSnapshot {
  fen: string;
  turn: TeamColor;
  inCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isGameOver: boolean;
  winner: TeamColor | null;
  reason: GameOutcomeReason | null;
  moveNumber: number;
  lastMove: { from: string; to: string; san: string } | null;
  capturedByRed: PieceType[];
  capturedByBlack: PieceType[];
  history: MoveRecord[];
}

export type ClientWsMessage =
  | { type: 'create_room'; timeControlMinutes?: TimeControlMinutes }
  | { type: 'join_room'; code: string }
  | { type: 'make_move'; code: string; from: string; to: string; promotion?: PieceType }
  | { type: 'resign'; code: string }
  | { type: 'request_rematch'; code: string };

export type ServerWsMessage =
  | {
      type: 'room_created';
      code: string;
      color: TeamColor;
      snapshot: GameSnapshot;
      clock: ClockState;
    }
  | {
      type: 'room_joined';
      code: string;
      color: TeamColor;
      opponentConnected: boolean;
      snapshot: GameSnapshot;
      clock: ClockState;
    }
  | { type: 'opponent_joined'; code: string; snapshot: GameSnapshot; clock: ClockState }
  | { type: 'state_update'; code: string; snapshot: GameSnapshot; clock: ClockState }
  | { type: 'game_over'; code: string; snapshot: GameSnapshot; clock: ClockState }
  | { type: 'opponent_disconnected'; code: string }
  | { type: 'error'; message: string };
