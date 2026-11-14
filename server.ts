import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { RoomManager, type ChessRoom } from './src/server/rooms';
import type { ClientWsMessage, ServerWsMessage } from './src/chess/types';

const PORT = 3000;

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const roomManager = new RoomManager();
  const socketsById = new Map<string, WebSocket>();
  const roomTimeoutTimers = new Map<string, NodeJS.Timeout>();

  function sendTo(playerId: string, payload: ServerWsMessage) {
    const ws = socketsById.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function clearRoomTimer(code: string) {
    const existing = roomTimeoutTimers.get(code);
    if (existing) {
      clearTimeout(existing);
      roomTimeoutTimers.delete(code);
    }
  }

  function scheduleRoomTimeout(room: ChessRoom) {
    clearRoomTimer(room.code);
    if (!room.activeTurn || room.engine.isGameOver()) return;

    const activeRemaining =
      room.activeTurn === 'w' ? room.wRemainingMs : room.bRemainingMs;
    const delayToStart = Math.max(0, room.turnStartedAtMs - Date.now());
    const waitMs = Math.max(10, delayToStart + activeRemaining);

    const timer = setTimeout(() => {
      roomTimeoutTimers.delete(room.code);
      const outcome = roomManager.checkTimeout(room.code);
      if (!outcome || !outcome.timedOut) return;
      sendTo(outcome.room.hostId, {
        type: 'game_over',
        code: outcome.room.code,
        snapshot: outcome.snapshot,
        clock: outcome.clock,
      });
      if (outcome.room.guestId) {
        sendTo(outcome.room.guestId, {
          type: 'game_over',
          code: outcome.room.code,
          snapshot: outcome.snapshot,
          clock: outcome.clock,
        });
      }
    }, waitMs);

    roomTimeoutTimers.set(room.code, timer);
  }

  wss.on('connection', (ws) => {
    const playerId = randomUUID();
    socketsById.set(playerId, ws);

    ws.on('message', (raw) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientWsMessage;
      } catch {
        sendTo(playerId, { type: 'error', message: 'Mensaje inválido.' });
        return;
      }

      if (msg.type === 'create_room') {
        const created = roomManager.createRoom(playerId, msg.timeControlMinutes);
        sendTo(playerId, {
          type: 'room_created',
          code: created.code,
          color: created.color,
          snapshot: created.snapshot,
          clock: created.clock,
        });
        return;
      }

      if (msg.type === 'join_room') {
        const res = roomManager.joinRoom(msg.code, playerId);
        if (!res.ok) {
          sendTo(playerId, { type: 'error', message: res.error });
          return;
        }
        sendTo(playerId, {
          type: 'room_joined',
          code: res.code,
          color: res.color,
          opponentConnected: true,
          snapshot: res.snapshot,
          clock: res.clock,
        });
        sendTo(res.hostId, {
          type: 'opponent_joined',
          code: res.code,
          snapshot: res.snapshot,
          clock: res.clock,
        });
        scheduleRoomTimeout(res.room);
        return;
      }

      if (msg.type === 'make_move') {
        const res = roomManager.makeMove(msg.code, playerId, msg.from, msg.to, msg.promotion);
        if (!res.ok) {
          sendTo(playerId, { type: 'error', message: res.error });
          return;
        }
        const eventType = res.snapshot.isGameOver ? 'game_over' : 'state_update';
        sendTo(res.room.hostId, {
          type: eventType,
          code: res.room.code,
          snapshot: res.snapshot,
          clock: res.clock,
        });
        if (res.room.guestId) {
          sendTo(res.room.guestId, {
            type: eventType,
            code: res.room.code,
            snapshot: res.snapshot,
            clock: res.clock,
          });
        }
        if (res.snapshot.isGameOver) {
          clearRoomTimer(res.room.code);
        } else {
          scheduleRoomTimeout(res.room);
        }
        return;
      }

      if (msg.type === 'resign') {
        const res = roomManager.resign(msg.code, playerId);
        if (!res.ok) {
          sendTo(playerId, { type: 'error', message: res.error });
          return;
        }
        clearRoomTimer(res.room.code);
        sendTo(res.room.hostId, {
          type: 'game_over',
          code: res.room.code,
          snapshot: res.snapshot,
          clock: res.clock,
        });
        if (res.room.guestId) {
          sendTo(res.room.guestId, {
            type: 'game_over',
            code: res.room.code,
            snapshot: res.snapshot,
            clock: res.clock,
          });
        }
        return;
      }

      if (msg.type === 'request_rematch') {
        const res = roomManager.rematch(msg.code, playerId);
        if (!res.ok) {
          sendTo(playerId, { type: 'error', message: res.error });
          return;
        }
        sendTo(res.room.hostId, {
          type: 'state_update',
          code: res.room.code,
          snapshot: res.snapshot,
          clock: res.clock,
        });
        if (res.room.guestId) {
          sendTo(res.room.guestId, {
            type: 'state_update',
            code: res.room.code,
            snapshot: res.snapshot,
            clock: res.clock,
          });
        }
        scheduleRoomTimeout(res.room);
      }
    });

    ws.on('close', () => {
      socketsById.delete(playerId);
      const disconnectInfo = roomManager.handleDisconnect(playerId);
      if (disconnectInfo) {
        clearRoomTimer(disconnectInfo.room.code);
        if (disconnectInfo.remainingPlayerId) {
          sendTo(disconnectInfo.remainingPlayerId, {
            type: 'opponent_disconnected',
            code: disconnectInfo.room.code,
          });
          sendTo(disconnectInfo.remainingPlayerId, {
            type: 'game_over',
            code: disconnectInfo.room.code,
            snapshot: disconnectInfo.room.engine.getSnapshot(),
            clock: disconnectInfo.clock,
          });
        }
      }
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: roomManager.getRoomCount() });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Dracula Chess 3D server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
