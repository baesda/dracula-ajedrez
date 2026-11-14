import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { RoomManager, type ChessRoom } from './src/server/rooms';
import type { ClientWsMessage, ServerWsMessage } from './src/chess/types';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  app.use(express.json());

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
        version: outcome.room.version,
      });
      if (outcome.room.guestId) {
        sendTo(outcome.room.guestId, {
          type: 'game_over',
          code: outcome.room.code,
          snapshot: outcome.snapshot,
          clock: outcome.clock,
          version: outcome.room.version,
        });
      }
    }, waitMs);

    roomTimeoutTimers.set(room.code, timer);
  }

  // HTTP REST endpoints (guaranteed to work across Cloud Run / AI Studio proxies & firewalls)
  app.post('/api/rooms', (req, res) => {
    const playerId = randomUUID();
    const timeControlMinutes = req.body?.timeControlMinutes;
    const created = roomManager.createRoom(playerId, timeControlMinutes);
    const room = roomManager.getRoom(created.code);
    res.json({
      code: created.code,
      playerId,
      color: created.color,
      snapshot: created.snapshot,
      clock: created.clock,
      version: room?.version ?? 1,
    });
  });

  app.post('/api/rooms/:code/join', (req, res) => {
    const playerId = randomUUID();
    const result = roomManager.joinRoom(req.params.code, playerId);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    sendTo(result.hostId, {
      type: 'opponent_joined',
      code: result.code,
      snapshot: result.snapshot,
      clock: result.clock,
      version: result.room.version,
    });
    scheduleRoomTimeout(result.room);
    res.json({
      code: result.code,
      playerId,
      color: result.color,
      opponentConnected: true,
      snapshot: result.snapshot,
      clock: result.clock,
      version: result.room.version,
    });
  });

  app.get('/api/rooms/:code/state', (req, res) => {
    const playerId = String(req.query.playerId ?? '');
    const state = roomManager.getRoomStateForPlayer(req.params.code, playerId);
    if (!state.ok) {
      res.status(404).json({ error: state.error });
      return;
    }
    res.json(state);
  });

  app.post('/api/rooms/:code/move', (req, res) => {
    const { playerId, from, to, promotion } = req.body ?? {};
    const result = roomManager.makeMove(
      req.params.code.trim().toLowerCase(),
      String(playerId ?? ''),
      String(from ?? ''),
      String(to ?? ''),
      promotion,
    );
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const eventType = result.snapshot.isGameOver ? 'game_over' : 'state_update';
    sendTo(result.room.hostId, {
      type: eventType,
      code: result.room.code,
      snapshot: result.snapshot,
      clock: result.clock,
      version: result.room.version,
    });
    if (result.room.guestId) {
      sendTo(result.room.guestId, {
        type: eventType,
        code: result.room.code,
        snapshot: result.snapshot,
        clock: result.clock,
        version: result.room.version,
      });
    }
    if (result.snapshot.isGameOver) {
      clearRoomTimer(result.room.code);
    } else {
      scheduleRoomTimeout(result.room);
    }
    res.json({
      code: result.room.code,
      snapshot: result.snapshot,
      clock: result.clock,
      version: result.room.version,
    });
  });

  app.post('/api/rooms/:code/resign', (req, res) => {
    const playerId = String(req.body?.playerId ?? '');
    const result = roomManager.resign(req.params.code.trim().toLowerCase(), playerId);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    clearRoomTimer(result.room.code);
    sendTo(result.room.hostId, {
      type: 'game_over',
      code: result.room.code,
      snapshot: result.snapshot,
      clock: result.clock,
      version: result.room.version,
    });
    if (result.room.guestId) {
      sendTo(result.room.guestId, {
        type: 'game_over',
        code: result.room.code,
        snapshot: result.snapshot,
        clock: result.clock,
        version: result.room.version,
      });
    }
    res.json({
      code: result.room.code,
      snapshot: result.snapshot,
      clock: result.clock,
      version: result.room.version,
    });
  });

  app.post('/api/rooms/:code/rematch', (req, res) => {
    const playerId = String(req.body?.playerId ?? '');
    const result = roomManager.rematch(req.params.code.trim().toLowerCase(), playerId);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    sendTo(result.room.hostId, {
      type: 'state_update',
      code: result.room.code,
      snapshot: result.snapshot,
      clock: result.clock,
      version: result.room.version,
    });
    if (result.room.guestId) {
      sendTo(result.room.guestId, {
        type: 'state_update',
        code: result.room.code,
        snapshot: result.snapshot,
        clock: result.clock,
        version: result.room.version,
      });
    }
    scheduleRoomTimeout(result.room);
    res.json({
      code: result.room.code,
      snapshot: result.snapshot,
      clock: result.clock,
      version: result.room.version,
    });
  });

  app.post('/api/rooms/:code/leave', (req, res) => {
    const playerId = String(req.body?.playerId ?? '');
    const disconnectInfo = roomManager.leaveRoom(req.params.code, playerId);
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
          version: disconnectInfo.room.version,
        });
      }
    }
    res.json({ ok: true });
  });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url ?? '/', 'http://localhost');
    const attachedId = reqUrl.searchParams.get('playerId')?.trim() || '';
    const isHttpSession = attachedId.length > 0;
    const playerId = attachedId || randomUUID();
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
        const room = roomManager.getRoom(created.code);
        sendTo(playerId, {
          type: 'room_created',
          code: created.code,
          color: created.color,
          snapshot: created.snapshot,
          clock: created.clock,
          version: room?.version ?? 1,
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
          version: res.room.version,
        });
        sendTo(res.hostId, {
          type: 'opponent_joined',
          code: res.code,
          snapshot: res.snapshot,
          clock: res.clock,
          version: res.room.version,
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
          version: res.room.version,
        });
        if (res.room.guestId) {
          sendTo(res.room.guestId, {
            type: eventType,
            code: res.room.code,
            snapshot: res.snapshot,
            clock: res.clock,
            version: res.room.version,
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
          version: res.room.version,
        });
        if (res.room.guestId) {
          sendTo(res.room.guestId, {
            type: 'game_over',
            code: res.room.code,
            snapshot: res.snapshot,
            clock: res.clock,
            version: res.room.version,
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
          version: res.room.version,
        });
        if (res.room.guestId) {
          sendTo(res.room.guestId, {
            type: 'state_update',
            code: res.room.code,
            snapshot: res.snapshot,
            clock: res.clock,
            version: res.room.version,
          });
        }
        scheduleRoomTimeout(res.room);
      }
    });

    ws.on('close', () => {
      if (socketsById.get(playerId) === ws) {
        socketsById.delete(playerId);
      }
      // If session was established over HTTP REST, keep room alive for HTTP polling fallback
      if (isHttpSession) return;

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
            version: disconnectInfo.room.version,
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
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Ruta de API no encontrada.' });
        return;
      }
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
