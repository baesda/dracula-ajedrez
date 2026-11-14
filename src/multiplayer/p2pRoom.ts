import Peer, { type DataConnection } from 'peerjs';
import type {
  ClockState,
  GameSnapshot,
  PieceType,
  TeamColor,
  TimeControlMinutes,
} from '../chess/types';
import { isValidRoomCode, RoomManager } from '../server/rooms';

const PEER_PREFIX = 'dracula-ajedrez-v1-';
const BC_PREFIX = 'dracula-ajedrez-bc-';

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

export type P2PInboundMessage =
  | { type: 'p2p_join'; via?: 'peer' | 'bc'; guestNonce?: string }
  | { type: 'p2p_move'; from: string; to: string; promotion?: PieceType }
  | { type: 'p2p_resign' }
  | { type: 'p2p_rematch' }
  | { type: 'p2p_leave' };

export type P2POutboundMessage =
  | {
      type: 'p2p_joined';
      code: string;
      color: TeamColor;
      opponentConnected: boolean;
      snapshot: GameSnapshot;
      clock: ClockState;
      version: number;
      guestNonce?: string;
    }
  | {
      type: 'p2p_state';
      code: string;
      snapshot: GameSnapshot;
      clock: ClockState;
      version: number;
      opponentDisconnected?: boolean;
    }
  | { type: 'p2p_clock'; clock: ClockState }
  | { type: 'p2p_error'; message: string; guestNonce?: string };

export interface P2PRoomUpdate {
  snapshot: GameSnapshot;
  clock: ClockState;
  version: number;
  opponentConnected: boolean;
  opponentDisconnected?: boolean;
}

export interface P2PSession {
  code: string;
  color: TeamColor;
  makeMove: (from: string, to: string, promotion?: PieceType) => Promise<{ ok: boolean; error?: string }>;
  resign: () => void;
  rematch: () => void;
  close: (notifyLeave?: boolean) => void;
}

export interface P2PHostCallbacks {
  onUpdate: (update: P2PRoomUpdate) => void;
  onClockSync: (clock: ClockState) => void;
  onError: (message: string) => void;
}

/**
 * Pure authoritative P2P host state machine backed by RoomManager.
 * Used in serverless/static deployments (e.g. Vercel) so the host browser
 * validates moves and runs the official chess clocks without needing a Node server.
 */
export class P2PHostCoordinator {
  private manager: RoomManager;
  readonly code: string;
  private guestJoined = false;

  constructor(
    timeControlMinutes: TimeControlMinutes,
    nowProvider: () => number = () => Date.now(),
  ) {
    this.manager = new RoomManager(nowProvider);
    const created = this.manager.createRoom('host', timeControlMinutes);
    this.code = created.code;
  }

  getInitialState(): {
    code: string;
    color: TeamColor;
    snapshot: GameSnapshot;
    clock: ClockState;
    version: number;
  } {
    const room = this.manager.getRoom(this.code)!;
    return {
      code: this.code,
      color: 'w',
      snapshot: room.engine.getSnapshot(),
      clock: this.manager.getClockState(room),
      version: room.version,
    };
  }

  handleGuestJoin():
    | { ok: true; payload: P2POutboundMessage; update: P2PRoomUpdate }
    | { ok: false; error: string } {
    const res = this.manager.joinRoom(this.code, 'guest');
    if (!res.ok) return { ok: false, error: res.error };
    this.guestJoined = true;
    return {
      ok: true,
      payload: {
        type: 'p2p_joined',
        code: this.code,
        color: 'b',
        opponentConnected: true,
        snapshot: res.snapshot,
        clock: res.clock,
        version: res.room.version,
      },
      update: {
        snapshot: res.snapshot,
        clock: res.clock,
        version: res.room.version,
        opponentConnected: true,
      },
    };
  }

  handleMove(
    sender: 'host' | 'guest',
    from: string,
    to: string,
    promotion?: PieceType,
  ):
    | { ok: true; payload: P2POutboundMessage; update: P2PRoomUpdate }
    | { ok: false; error: string } {
    const res = this.manager.makeMove(this.code, sender, from, to, promotion);
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      payload: {
        type: 'p2p_state',
        code: this.code,
        snapshot: res.snapshot,
        clock: res.clock,
        version: res.room.version,
      },
      update: {
        snapshot: res.snapshot,
        clock: res.clock,
        version: res.room.version,
        opponentConnected: true,
      },
    };
  }

  handleResign(
    sender: 'host' | 'guest',
  ): { ok: true; payload: P2POutboundMessage; update: P2PRoomUpdate } | { ok: false; error: string } {
    const res = this.manager.resign(this.code, sender);
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      payload: {
        type: 'p2p_state',
        code: this.code,
        snapshot: res.snapshot,
        clock: res.clock,
        version: res.room.version,
      },
      update: {
        snapshot: res.snapshot,
        clock: res.clock,
        version: res.room.version,
        opponentConnected: true,
      },
    };
  }

  handleRematch(
    sender: 'host' | 'guest',
  ): { ok: true; payload: P2POutboundMessage; update: P2PRoomUpdate } | { ok: false; error: string } {
    const res = this.manager.rematch(this.code, sender);
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      payload: {
        type: 'p2p_state',
        code: this.code,
        snapshot: res.snapshot,
        clock: res.clock,
        version: res.room.version,
      },
      update: {
        snapshot: res.snapshot,
        clock: res.clock,
        version: res.room.version,
        opponentConnected: true,
      },
    };
  }

  handlePeerLeft(
    sender: 'host' | 'guest',
  ): { payload: P2POutboundMessage; update: P2PRoomUpdate } | null {
    if (!this.guestJoined) return null;
    const info = this.manager.leaveRoom(this.code, sender);
    if (!info) return null;
    const snap = info.room.engine.getSnapshot();
    return {
      payload: {
        type: 'p2p_state',
        code: this.code,
        snapshot: snap,
        clock: info.clock,
        version: info.room.version,
        opponentDisconnected: true,
      },
      update: {
        snapshot: snap,
        clock: info.clock,
        version: info.room.version,
        opponentConnected: true,
        opponentDisconnected: true,
      },
    };
  }

  tickTimeout(): { payload: P2POutboundMessage; update: P2PRoomUpdate } | null {
    const outcome = this.manager.checkTimeout(this.code);
    if (!outcome || !outcome.timedOut) return null;
    return {
      payload: {
        type: 'p2p_state',
        code: this.code,
        snapshot: outcome.snapshot,
        clock: outcome.clock,
        version: outcome.room.version,
      },
      update: {
        snapshot: outcome.snapshot,
        clock: outcome.clock,
        version: outcome.room.version,
        opponentConnected: true,
      },
    };
  }

  getClockSyncMessage(): P2POutboundMessage | null {
    const room = this.manager.getRoom(this.code);
    if (!room || !room.activeTurn) return null;
    return {
      type: 'p2p_clock',
      clock: this.manager.getClockState(room),
    };
  }
}

export async function createP2PHostRoom(
  timeControlMinutes: TimeControlMinutes,
  callbacks: P2PHostCallbacks,
): Promise<{
  session: P2PSession;
  code: string;
  color: TeamColor;
  snapshot: GameSnapshot;
  clock: ClockState;
  version: number;
}> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const coordinator = new P2PHostCoordinator(timeControlMinutes);
    const initial = coordinator.getInitialState();
    const peerId = `${PEER_PREFIX}${initial.code}`;

    let peer: Peer | null = null;
    try {
      peer = await new Promise<Peer>((resolve, reject) => {
        const p = new Peer(peerId, { debug: 0, config: ICE_CONFIG });
        const timer = window.setTimeout(() => {
          p.destroy();
          reject(new Error('Tiempo agotado al conectar con el servicio de salas P2P.'));
        }, 9000);

        p.once('open', () => {
          window.clearTimeout(timer);
          resolve(p);
        });
        p.once('error', (err) => {
          window.clearTimeout(timer);
          p.destroy();
          reject(err);
        });
      });
    } catch (err) {
      const peerErr = err as { type?: string };
      lastError = err instanceof Error ? err : new Error('No se pudo crear la sala P2P.');
      if (peerErr?.type === 'unavailable-id') {
        continue;
      }
      // If PeerJS cloud signaling itself is unreachable, still allow same-browser BroadcastChannel rooms
      if (typeof BroadcastChannel === 'undefined') {
        throw lastError;
      }
      peer = null;
    }

    let guestConn: DataConnection | null = null;
    const pendingGuestQueue: P2POutboundMessage[] = [];
    let bc: BroadcastChannel | null =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(`${BC_PREFIX}${initial.code}`)
        : null;
    let activeGuestChannel: 'peer' | 'bc' | null = null;
    let closed = false;

    const sendToGuest = (msg: P2POutboundMessage) => {
      if (activeGuestChannel === 'bc' && bc) {
        bc.postMessage(msg);
        return;
      }
      if (guestConn) {
        if (guestConn.open) {
          guestConn.send(msg);
        } else {
          pendingGuestQueue.push(msg);
        }
      }
    };

    const handleInbound = (msg: P2PInboundMessage, via: 'peer' | 'bc') => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'p2p_join') {
        if (activeGuestChannel && activeGuestChannel !== via) {
          const errMsg: P2POutboundMessage = {
            type: 'p2p_error',
            message: 'Esta partida ya está llena (2 jugadores conectados).',
            guestNonce: msg.guestNonce,
          };
          if (via === 'bc') bc?.postMessage(errMsg);
          return;
        }
        const joined = coordinator.handleGuestJoin();
        if (!joined.ok) {
          const errMsg: P2POutboundMessage = {
            type: 'p2p_error',
            message: joined.error,
            guestNonce: msg.guestNonce,
          };
          if (via === 'bc') bc?.postMessage(errMsg);
          else sendToGuest(errMsg);
          return;
        }
        activeGuestChannel = via;
        const payload: P2POutboundMessage =
          joined.payload.type === 'p2p_joined'
            ? { ...joined.payload, guestNonce: msg.guestNonce }
            : joined.payload;
        sendToGuest(payload);
        callbacks.onUpdate(joined.update);
      } else if (msg.type === 'p2p_move') {
        const moved = coordinator.handleMove('guest', msg.from, msg.to, msg.promotion);
        if (!moved.ok) {
          sendToGuest({ type: 'p2p_error', message: moved.error });
          return;
        }
        sendToGuest(moved.payload);
        callbacks.onUpdate(moved.update);
      } else if (msg.type === 'p2p_resign') {
        const resigned = coordinator.handleResign('guest');
        if (resigned.ok) {
          sendToGuest(resigned.payload);
          callbacks.onUpdate(resigned.update);
        }
      } else if (msg.type === 'p2p_rematch') {
        const rematched = coordinator.handleRematch('guest');
        if (rematched.ok) {
          sendToGuest(rematched.payload);
          callbacks.onUpdate(rematched.update);
        }
      } else if (msg.type === 'p2p_leave') {
        const left = coordinator.handlePeerLeft('guest');
        if (left) {
          callbacks.onUpdate(left.update);
        }
      }
    };

    if (bc) {
      bc.onmessage = (event) => {
        const msg = event.data as P2PInboundMessage;
        if (
          msg &&
          typeof msg === 'object' &&
          ('type' in msg) &&
          (msg.type === 'p2p_join' ||
            msg.type === 'p2p_move' ||
            msg.type === 'p2p_resign' ||
            msg.type === 'p2p_rematch' ||
            msg.type === 'p2p_leave')
        ) {
          handleInbound(msg, 'bc');
        }
      };
    }

    const timeoutInterval = window.setInterval(() => {
      if (closed) return;
      const timedOut = coordinator.tickTimeout();
      if (timedOut) {
        sendToGuest(timedOut.payload);
        callbacks.onUpdate(timedOut.update);
      }
    }, 500);

    const clockSyncInterval = window.setInterval(() => {
      if (closed || !activeGuestChannel) return;
      const syncMsg = coordinator.getClockSyncMessage();
      if (syncMsg) sendToGuest(syncMsg);
    }, 2500);

    peer?.on('connection', (conn) => {
      if (activeGuestChannel) {
        const rejectFull = () => {
          conn.send({
            type: 'p2p_error',
            message: 'Esta partida ya está llena (2 jugadores conectados).',
          } satisfies P2POutboundMessage);
          setTimeout(() => conn.close(), 150);
        };
        if (conn.open) rejectFull();
        else conn.once('open', rejectFull);
        return;
      }

      guestConn = conn;
      conn.on('open', () => {
        while (pendingGuestQueue.length > 0 && conn.open) {
          const next = pendingGuestQueue.shift();
          if (next) conn.send(next);
        }
      });

      conn.on('data', (raw) => {
        handleInbound(raw as P2PInboundMessage, 'peer');
      });

      conn.on('close', () => {
        if (closed || activeGuestChannel !== 'peer') return;
        const left = coordinator.handlePeerLeft('guest');
        if (left) {
          callbacks.onUpdate(left.update);
        }
      });
    });

    const session: P2PSession = {
      code: initial.code,
      color: 'w',
      makeMove: async (from, to, promotion) => {
        const moved = coordinator.handleMove('host', from, to, promotion);
        if (!moved.ok) return { ok: false, error: moved.error };
        sendToGuest(moved.payload);
        callbacks.onUpdate(moved.update);
        return { ok: true };
      },
      resign: () => {
        const resigned = coordinator.handleResign('host');
        if (resigned.ok) {
          sendToGuest(resigned.payload);
          callbacks.onUpdate(resigned.update);
        }
      },
      rematch: () => {
        const rematched = coordinator.handleRematch('host');
        if (rematched.ok) {
          sendToGuest(rematched.payload);
          callbacks.onUpdate(rematched.update);
        }
      },
      close: (notifyLeave = false) => {
        if (closed) return;
        closed = true;
        window.clearInterval(timeoutInterval);
        window.clearInterval(clockSyncInterval);
        if (notifyLeave) {
          const left = coordinator.handlePeerLeft('host');
          if (left) sendToGuest(left.payload);
        }
        try {
          guestConn?.close();
        } catch {
          // ignore
        }
        try {
          bc?.close();
          bc = null;
        } catch {
          // ignore
        }
        try {
          peer?.destroy();
        } catch {
          // ignore
        }
      },
    };

    return {
      session,
      ...initial,
    };
  }

  throw lastError ?? new Error('No se pudo conectar con el servicio de salas en línea.');
}

export async function joinP2PGuestRoom(
  rawCode: string,
  callbacks: P2PHostCallbacks,
): Promise<{
  session: P2PSession;
  code: string;
  color: TeamColor;
  snapshot: GameSnapshot;
  clock: ClockState;
  version: number;
}> {
  const code = rawCode.trim().toLowerCase();
  if (!isValidRoomCode(code)) {
    throw new Error('El código debe tener exactamente 5 letras minúsculas (ej. dracu).');
  }

  const guestNonce = Math.random().toString(36).slice(2, 10);

  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0, config: ICE_CONFIG });
    let conn: DataConnection | null = null;
    let bc: BroadcastChannel | null =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(`${BC_PREFIX}${code}`)
        : null;
    let activeChannel: 'peer' | 'bc' | null = null;
    let settled = false;
    let closed = false;

    const cleanup = () => {
      try {
        conn?.close();
      } catch {
        // ignore
      }
      try {
        peer.destroy();
      } catch {
        // ignore
      }
      try {
        bc?.close();
        bc = null;
      } catch {
        // ignore
      }
    };

    const fail = (message: string) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(connectTimer);
        cleanup();
        reject(new Error(message));
      } else {
        callbacks.onError(message);
      }
    };

    const connectTimer = window.setTimeout(() => {
      fail(`No se pudo conectar con la sala "${code}". Comprueba que el anfitrión siga esperando.`);
    }, 10000);

    const handleOutboundFromHost = (msg: P2POutboundMessage, via: 'peer' | 'bc') => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'p2p_error') {
        if (via === 'bc' && msg.guestNonce && msg.guestNonce !== guestNonce) return;
        if (!settled) {
          fail(msg.message);
        } else {
          callbacks.onError(msg.message);
        }
        return;
      }

      if (msg.type === 'p2p_joined' && !settled) {
        if (via === 'bc' && msg.guestNonce && msg.guestNonce !== guestNonce) return;
        settled = true;
        activeChannel = via;
        window.clearTimeout(connectTimer);

        if (via === 'bc') {
          try {
            conn?.close();
          } catch {
            // ignore
          }
          try {
            peer.destroy();
          } catch {
            // ignore
          }
        } else {
          try {
            bc?.close();
            bc = null;
          } catch {
            // ignore
          }
        }

        const sendToHost = (out: P2PInboundMessage): boolean => {
          if (activeChannel === 'bc' && bc) {
            bc.postMessage(out);
            return true;
          }
          if (conn && conn.open) {
            conn.send(out);
            return true;
          }
          return false;
        };

        const session: P2PSession = {
          code: msg.code,
          color: msg.color,
          makeMove: async (from, to, promotion) => {
            if (!sendToHost({ type: 'p2p_move', from, to, promotion })) {
              return { ok: false, error: 'Conexión perdida con la sala.' };
            }
            return { ok: true };
          },
          resign: () => {
            sendToHost({ type: 'p2p_resign' });
          },
          rematch: () => {
            sendToHost({ type: 'p2p_rematch' });
          },
          close: (notifyLeave = false) => {
            if (closed) return;
            closed = true;
            if (notifyLeave) {
              sendToHost({ type: 'p2p_leave' });
            }
            cleanup();
          },
        };

        resolve({
          session,
          code: msg.code,
          color: msg.color,
          snapshot: msg.snapshot,
          clock: msg.clock,
          version: msg.version,
        });
        return;
      }

      if (activeChannel && via !== activeChannel) return;

      if (msg.type === 'p2p_state') {
        callbacks.onUpdate({
          snapshot: msg.snapshot,
          clock: msg.clock,
          version: msg.version,
          opponentConnected: true,
          opponentDisconnected: msg.opponentDisconnected,
        });
      } else if (msg.type === 'p2p_clock') {
        callbacks.onClockSync(msg.clock);
      }
    };

    if (bc) {
      bc.onmessage = (event) => {
        const msg = event.data as P2POutboundMessage;
        if (
          msg &&
          typeof msg === 'object' &&
          ('type' in msg) &&
          (msg.type === 'p2p_joined' ||
            msg.type === 'p2p_state' ||
            msg.type === 'p2p_clock' ||
            msg.type === 'p2p_error')
        ) {
          handleOutboundFromHost(msg, 'bc');
        }
      };
      // Instant same-browser probe
      bc.postMessage({ type: 'p2p_join', via: 'bc', guestNonce } satisfies P2PInboundMessage);
    }

    peer.on('error', (err) => {
      if (settled) return;
      const peerErr = err as { type?: string };
      if (peerErr?.type === 'peer-unavailable') {
        // Give BroadcastChannel 400ms to answer before reporting room not found
        window.setTimeout(() => {
          if (!settled) {
            fail(`No existe ninguna partida activa con el código "${code}".`);
          }
        }, 400);
      }
    });

    peer.once('open', () => {
      if (settled) return;
      conn = peer.connect(`${PEER_PREFIX}${code}`, {
        reliable: true,
        serialization: 'json',
      });

      conn.once('open', () => {
        if (settled) {
          conn?.close();
          return;
        }
        conn?.send({ type: 'p2p_join', via: 'peer', guestNonce } satisfies P2PInboundMessage);
      });

      conn.on('data', (raw) => {
        handleOutboundFromHost(raw as P2POutboundMessage, 'peer');
      });

      conn.on('close', () => {
        if (!settled) return;
        if (activeChannel === 'peer' && !closed) {
          callbacks.onError('El anfitrión se desconectó de la sala.');
        }
      });
    });
  });
}
