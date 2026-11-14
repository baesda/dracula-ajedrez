import { normalizeTimeControl } from '../chess/clock';
import { DraculaChessEngine } from '../chess/engine';
import type {
  ClockState,
  GameSnapshot,
  PieceType,
  TeamColor,
  TimeControlMinutes,
} from '../chess/types';
import { CAPTURE_ANIM_DURATION } from '../three/animationConfig';

export interface PlayerSlot {
  id: string;
  color: TeamColor;
}

export interface ChessRoom {
  code: string;
  engine: DraculaChessEngine;
  hostId: string;
  guestId: string | null;
  createdAt: number;
  timeControlMinutes: TimeControlMinutes;
  wRemainingMs: number;
  bRemainingMs: number;
  activeTurn: TeamColor | null;
  turnStartedAtMs: number;
}

const LOWERCASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function isValidRoomCode(code: string): boolean {
  return /^[a-z]{5}$/.test(code);
}

export function generateRoomCode(existingCodes: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * LOWERCASE_LETTERS.length);
      code += LOWERCASE_LETTERS[idx];
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  throw new Error('No se pudo generar un código único');
}

export class RoomManager {
  private rooms = new Map<string, ChessRoom>();
  private nowProvider: () => number;

  constructor(nowProvider: () => number = () => Date.now()) {
    this.nowProvider = nowProvider;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getRoom(code: string): ChessRoom | undefined {
    return this.rooms.get(code);
  }

  getClockState(room: ChessRoom, atMs: number = this.nowProvider()): ClockState {
    return {
      initialMinutes: room.timeControlMinutes,
      wRemainingMs: room.wRemainingMs,
      bRemainingMs: room.bRemainingMs,
      activeTurn: room.activeTurn,
      turnStartedAtMs: room.turnStartedAtMs,
      serverNowMs: atMs,
    };
  }

  createRoom(
    hostId: string,
    requestedMinutes?: TimeControlMinutes,
  ): { code: string; color: TeamColor; snapshot: GameSnapshot; clock: ClockState } {
    const existing = new Set(this.rooms.keys());
    const code = generateRoomCode(existing);
    const engine = new DraculaChessEngine();
    const now = this.nowProvider();
    const timeControlMinutes = normalizeTimeControl(requestedMinutes);
    const initialMs = timeControlMinutes * 60_000;

    const room: ChessRoom = {
      code,
      engine,
      hostId,
      guestId: null,
      createdAt: now,
      timeControlMinutes,
      wRemainingMs: initialMs,
      bRemainingMs: initialMs,
      activeTurn: null, // Clock starts only once opponent joins
      turnStartedAtMs: now,
    };
    this.rooms.set(code, room);
    return {
      code,
      color: 'w',
      snapshot: engine.getSnapshot(),
      clock: this.getClockState(room, now),
    };
  }

  joinRoom(
    rawCode: string,
    guestId: string,
  ):
    | {
        ok: true;
        code: string;
        color: TeamColor;
        snapshot: GameSnapshot;
        clock: ClockState;
        hostId: string;
        room: ChessRoom;
      }
    | { ok: false; error: string } {
    const code = rawCode.trim().toLowerCase();
    if (!isValidRoomCode(code)) {
      return {
        ok: false,
        error: 'El código debe tener exactamente 5 letras minúsculas (ej. dracu).',
      };
    }

    const room = this.rooms.get(code);
    if (!room) {
      return {
        ok: false,
        error: `No existe ninguna partida activa con el código "${code}".`,
      };
    }

    if (room.guestId && room.guestId !== guestId) {
      return {
        ok: false,
        error: 'Esta partida ya está llena (2 jugadores conectados).',
      };
    }

    const now = this.nowProvider();
    const firstJoin = !room.guestId;
    room.guestId = guestId;
    if (firstJoin && !room.engine.isGameOver()) {
      room.activeTurn = room.engine.getTurn();
      room.turnStartedAtMs = now;
    }

    return {
      ok: true,
      code,
      color: 'b',
      snapshot: room.engine.getSnapshot(),
      clock: this.getClockState(room, now),
      hostId: room.hostId,
      room,
    };
  }

  checkTimeout(
    code: string,
  ): { timedOut: boolean; snapshot: GameSnapshot; clock: ClockState; room: ChessRoom } | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const now = this.nowProvider();
    if (!room.activeTurn || room.engine.isGameOver()) {
      return {
        timedOut: false,
        snapshot: room.engine.getSnapshot(),
        clock: this.getClockState(room, now),
        room,
      };
    }

    const elapsed = Math.max(0, now - room.turnStartedAtMs);
    const remaining =
      room.activeTurn === 'w' ? room.wRemainingMs - elapsed : room.bRemainingMs - elapsed;

    if (remaining <= 0) {
      if (room.activeTurn === 'w') {
        room.wRemainingMs = 0;
      } else {
        room.bRemainingMs = 0;
      }
      room.engine.setTimeoutLoss(room.activeTurn);
      room.activeTurn = null;
      return {
        timedOut: true,
        snapshot: room.engine.getSnapshot(),
        clock: this.getClockState(room, now),
        room,
      };
    }

    return {
      timedOut: false,
      snapshot: room.engine.getSnapshot(),
      clock: this.getClockState(room, now),
      room,
    };
  }

  makeMove(
    code: string,
    playerId: string,
    from: string,
    to: string,
    promotion?: PieceType,
  ):
    | { ok: true; snapshot: GameSnapshot; clock: ClockState; room: ChessRoom; timedOut?: boolean }
    | { ok: false; error: string } {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Partida no encontrada.' };
    if (!room.guestId) {
      return { ok: false, error: 'Esperando a que el segundo jugador se una con el código.' };
    }

    const playerColor: TeamColor | null =
      playerId === room.hostId ? 'w' : playerId === room.guestId ? 'b' : null;
    if (!playerColor) return { ok: false, error: 'No perteneces a esta partida.' };

    if (room.engine.isGameOver()) {
      return { ok: false, error: 'La partida ya ha terminado.' };
    }

    if (room.engine.getTurn() !== playerColor) {
      return { ok: false, error: 'No es tu turno todavía.' };
    }

    const now = this.nowProvider();
    const elapsed = room.activeTurn ? Math.max(0, now - room.turnStartedAtMs) : 0;
    const currentRemaining =
      playerColor === 'w' ? room.wRemainingMs - elapsed : room.bRemainingMs - elapsed;

    if (currentRemaining <= 0) {
      if (playerColor === 'w') room.wRemainingMs = 0;
      else room.bRemainingMs = 0;
      room.engine.setTimeoutLoss(playerColor);
      room.activeTurn = null;
      return {
        ok: true,
        timedOut: true,
        snapshot: room.engine.getSnapshot(),
        clock: this.getClockState(room, now),
        room,
      };
    }

    const move = room.engine.makeMove(from, to, promotion);
    if (!move) {
      return { ok: false, error: 'Movimiento ilegal según las reglas del ajedrez.' };
    }

    if (playerColor === 'w') {
      room.wRemainingMs = Math.max(0, currentRemaining);
    } else {
      room.bRemainingMs = Math.max(0, currentRemaining);
    }

    if (room.engine.isGameOver()) {
      room.activeTurn = null;
      room.turnStartedAtMs = now;
    } else {
      room.activeTurn = room.engine.getTurn();
      // Pause next player's clock during the 5-10s gore capture cinematic while input is locked
      const captureDelayMs = move.captured
        ? Math.round(CAPTURE_ANIM_DURATION[move.piece] * 1000)
        : 0;
      room.turnStartedAtMs = now + captureDelayMs;
    }

    return {
      ok: true,
      snapshot: room.engine.getSnapshot(),
      clock: this.getClockState(room, now),
      room,
    };
  }

  resign(
    code: string,
    playerId: string,
  ):
    | { ok: true; snapshot: GameSnapshot; clock: ClockState; room: ChessRoom }
    | { ok: false; error: string } {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Partida no encontrada.' };
    const playerColor: TeamColor | null =
      playerId === room.hostId ? 'w' : playerId === room.guestId ? 'b' : null;
    if (!playerColor) return { ok: false, error: 'No perteneces a esta partida.' };

    const now = this.nowProvider();
    if (room.activeTurn) {
      const elapsed = Math.max(0, now - room.turnStartedAtMs);
      if (room.activeTurn === 'w') {
        room.wRemainingMs = Math.max(0, room.wRemainingMs - elapsed);
      } else {
        room.bRemainingMs = Math.max(0, room.bRemainingMs - elapsed);
      }
      room.activeTurn = null;
    }

    room.engine.resign(playerColor);
    return {
      ok: true,
      snapshot: room.engine.getSnapshot(),
      clock: this.getClockState(room, now),
      room,
    };
  }

  rematch(
    code: string,
    playerId: string,
  ):
    | { ok: true; snapshot: GameSnapshot; clock: ClockState; room: ChessRoom }
    | { ok: false; error: string } {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Partida no encontrada.' };
    if (playerId !== room.hostId && playerId !== room.guestId) {
      return { ok: false, error: 'No perteneces a esta partida.' };
    }
    const now = this.nowProvider();
    const initialMs = room.timeControlMinutes * 60_000;
    room.engine.reset();
    room.wRemainingMs = initialMs;
    room.bRemainingMs = initialMs;
    room.activeTurn = room.guestId ? 'w' : null;
    room.turnStartedAtMs = now;
    return {
      ok: true,
      snapshot: room.engine.getSnapshot(),
      clock: this.getClockState(room, now),
      room,
    };
  }

  handleDisconnect(
    playerId: string,
  ): { room: ChessRoom; remainingPlayerId: string | null; clock: ClockState } | null {
    const now = this.nowProvider();
    for (const [code, room] of this.rooms.entries()) {
      if (room.hostId === playerId || room.guestId === playerId) {
        const remainingPlayerId =
          room.hostId === playerId ? room.guestId : room.hostId;
        if (room.activeTurn) {
          const elapsed = Math.max(0, now - room.turnStartedAtMs);
          if (room.activeTurn === 'w') {
            room.wRemainingMs = Math.max(0, room.wRemainingMs - elapsed);
          } else {
            room.bRemainingMs = Math.max(0, room.bRemainingMs - elapsed);
          }
          room.activeTurn = null;
        }
        if (remainingPlayerId && !room.engine.isGameOver()) {
          const winner: TeamColor = remainingPlayerId === room.hostId ? 'w' : 'b';
          room.engine.setOpponentLeft(winner);
        }
        const clock = this.getClockState(room, now);
        this.rooms.delete(code);
        return { room, remainingPlayerId, clock };
      }
    }
    return null;
  }
}
