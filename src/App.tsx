import { useCallback, useEffect, useRef, useState } from 'react';
import { draculaAudio } from './audio/draculaAudio';
import { chooseAiMove, clampElo } from './chess/ai';
import type { AiWorkerRequest, AiWorkerResponse } from './chess/ai.worker';
import { computeDisplayClockMs } from './chess/clock';
import { DraculaChessEngine } from './chess/engine';
import type {
  AppScreenState,
  ClockState,
  GameMode,
  GameSnapshot,
  LegalMoveTarget,
  PieceType,
  ServerWsMessage,
  TeamColor,
  TimeControlMinutes,
} from './chess/types';
import { DraculaTitleOverlay, type TwoPlayerStep } from './components/DraculaTitleOverlay';
import { FallbackBoard2D } from './components/FallbackBoard2D';
import { GameHud } from './components/GameHud';
import {
  createP2PHostRoom,
  joinP2PGuestRoom,
  type P2PSession,
} from './multiplayer/p2pRoom';
import { DraculaChessScene } from './three/DraculaChessScene';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<DraculaChessScene | null>(null);
  const engineRef = useRef<DraculaChessEngine>(new DraculaChessEngine());
  const wsRef = useRef<WebSocket | null>(null);
  const aiTimerRef = useRef<number | null>(null);
  const aiWorkerRef = useRef<Worker | null>(null);
  const aiReqIdRef = useRef(0);

  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [screenState, setScreenState] = useState<AppScreenState>(
    autostart ? 'playing' : 'title',
  );
  const [gameMode, setGameMode] = useState<GameMode>('1p');
  const [aiElo, setAiElo] = useState<number>(1500);
  const [playerColor, setPlayerColor] = useState<TeamColor>('w');
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() =>
    engineRef.current.getSnapshot(),
  );
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<LegalMoveTarget[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isCaptureAnimating, setIsCaptureAnimating] = useState(false);
  const [muted, setMuted] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [sceneRetryCount, setSceneRetryCount] = useState(0);

  // 2-Player Room & Clock State
  const [twoPlayerStep, setTwoPlayerStep] = useState<TwoPlayerStep | null>(null);
  const [timeControlMinutes, setTimeControlMinutes] = useState<TimeControlMinutes>(10);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [clockState, setClockState] = useState<ClockState | null>(null);
  const clockOffsetMsRef = useRef<number>(0);
  const [clockDisplay, setClockDisplay] = useState<{ wMs: number; bMs: number }>({
    wMs: 10 * 60_000,
    bMs: 10 * 60_000,
  });
  const playerIdRef = useRef<string | null>(null);
  const p2pSessionRef = useRef<P2PSession | null>(null);
  const transportModeRef = useRef<'server' | 'p2p' | null>(null);
  const roomVersionRef = useRef<number>(0);
  const opponentJoinedNotifiedRef = useRef<boolean>(false);

  // Mutable refs for event handlers so Three.js scene never remounts
  const stateRef = useRef({
    screenState,
    gameMode,
    playerColor,
    selectedSquare,
    legalMoves,
    isAiThinking,
    isCaptureAnimating,
    roomCode,
    aiElo,
  });
  stateRef.current = {
    screenState,
    gameMode,
    playerColor,
    selectedSquare,
    legalMoves,
    isAiThinking,
    isCaptureAnimating,
    roomCode,
    aiElo,
  };

  useEffect(() => {
    document.body.dataset.state = screenState;
    document.body.dataset.turn = snapshot.turn;
    document.body.dataset.moves = String(snapshot.history.length);
    document.body.dataset.capturing = isCaptureAnimating ? 'true' : 'false';
  }, [screenState, snapshot.turn, snapshot.history.length, isCaptureAnimating]);

  const applyServerClock = useCallback((nextClock: ClockState) => {
    const now = Date.now();
    clockOffsetMsRef.current = nextClock.serverNowMs - now;
    setClockState(nextClock);
    setClockDisplay(computeDisplayClockMs(nextClock, now, clockOffsetMsRef.current));
  }, []);

  useEffect(() => {
    if (gameMode !== '2p' || !clockState) return;
    setClockDisplay(computeDisplayClockMs(clockState, Date.now(), clockOffsetMsRef.current));
    if (!clockState.activeTurn || snapshot.isGameOver) return;

    const id = window.setInterval(() => {
      setClockDisplay(computeDisplayClockMs(clockState, Date.now(), clockOffsetMsRef.current));
    }, 50);
    return () => window.clearInterval(id);
  }, [clockState, gameMode, snapshot.isGameOver]);

  const closeSocket = useCallback((notifyLeave = false) => {
    if (p2pSessionRef.current) {
      p2pSessionRef.current.close(notifyLeave);
      p2pSessionRef.current = null;
    }
    const code = stateRef.current.roomCode;
    const pid = playerIdRef.current;
    if (notifyLeave && code && pid) {
      fetch(`/api/rooms/${encodeURIComponent(code)}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: pid }),
        keepalive: true,
      }).catch(() => {});
    }
    playerIdRef.current = null;
    roomVersionRef.current = 0;
    opponentJoinedNotifiedRef.current = false;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const clearAiTimer = useCallback(() => {
    if (aiTimerRef.current !== null) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    aiReqIdRef.current++;
  }, []);

  const syncSceneNow = useCallback(
    (
      nextSelected: string | null,
      nextMoves: LegalMoveTarget[],
      nextSnap?: GameSnapshot,
    ) => {
      const snap = nextSnap ?? engineRef.current.getSnapshot();
      sceneRef.current?.syncState(
        engineRef.current.getPieces(),
        snap,
        nextSelected,
        nextMoves,
      );
    },
    [],
  );

  const playSoundForMove = useCallback(
    (snap: GameSnapshot, wasCapture: boolean, wasCastle: boolean, movedPiece?: PieceType) => {
      if (snap.isGameOver && !wasCapture) {
        draculaAudio.playGameOver(snap.winner === stateRef.current.playerColor);
      } else if (snap.inCheck && !wasCapture) {
        draculaAudio.playCheck();
      } else if (wasCapture) {
        // Capture gore audio is played directly by DraculaChessScene when the sequence begins
        return;
      } else if (wasCastle) {
        draculaAudio.playCastle();
      } else if (movedPiece === 'n') {
        draculaAudio.playKnightLeap();
      } else {
        draculaAudio.playMove();
      }
    },
    [],
  );

  const applyAiChosenMove = useCallback(
    (move: { from: string; to: string; promotion?: PieceType } | null) => {
      const engine = engineRef.current;
      if (move && stateRef.current.gameMode === '1p' && !engine.isGameOver()) {
        const res = engine.makeMove(move.from, move.to, move.promotion);
        const snap = engine.getSnapshot();
        setSnapshot(snap);
        setSelectedSquare(null);
        setLegalMoves([]);
        syncSceneNow(null, [], snap);
        const wasCapture = Boolean(res?.captured);
        if (res) {
          playSoundForMove(snap, wasCapture, res.san.startsWith('O-'), res.piece as PieceType);
        }
        if (snap.isGameOver && !wasCapture) {
          setScreenState('gameover');
        }
      }
      setIsAiThinking(false);
    },
    [playSoundForMove, syncSceneNow],
  );

  const applyAiChosenMoveRef = useRef(applyAiChosenMove);
  applyAiChosenMoveRef.current = applyAiChosenMove;

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    try {
      const worker = new Worker(new URL('./chess/ai.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
        if (event.data.id !== aiReqIdRef.current) return;
        applyAiChosenMoveRef.current(event.data.move);
      };
      worker.onerror = () => {
        // Fallback smoothly to main-thread move if worker errors
        const engine = engineRef.current;
        if (!engine.isGameOver() && stateRef.current.gameMode === '1p') {
          applyAiChosenMoveRef.current(chooseAiMove(engine.getFen(), stateRef.current.aiElo));
        }
      };
      aiWorkerRef.current = worker;
      return () => {
        worker.terminate();
        aiWorkerRef.current = null;
      };
    } catch {
      return;
    }
  }, []);

  const triggerAiTurnIfNeeded = useCallback(() => {
    const engine = engineRef.current;
    if (
      stateRef.current.gameMode !== '1p' ||
      engine.isGameOver() ||
      engine.getTurn() === stateRef.current.playerColor
    ) {
      return;
    }

    setIsAiThinking(true);
    clearAiTimer();
    const reqId = ++aiReqIdRef.current;
    const fen = engine.getFen();
    const elo = stateRef.current.aiElo;

    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null;
      if (reqId !== aiReqIdRef.current) return;
      if (aiWorkerRef.current) {
        const req: AiWorkerRequest = { id: reqId, fen, elo };
        aiWorkerRef.current.postMessage(req);
      } else {
        applyAiChosenMoveRef.current(chooseAiMove(fen, elo));
      }
    }, 180);
  }, [clearAiTimer]);

  const executePlayerMove = useCallback(
    (from: string, to: string, promotion?: PieceType) => {
      const { gameMode: mode, roomCode: code } = stateRef.current;
      const engine = engineRef.current;

      if (mode === '2p') {
        if (p2pSessionRef.current) {
          setSelectedSquare(null);
          setLegalMoves([]);
          syncSceneNow(null, []);
          p2pSessionRef.current.makeMove(from, to, promotion).then((res) => {
            if (!res.ok) {
              setStatusBanner(res.error || 'No se pudo enviar la jugada.');
            }
          });
          return;
        }
        const pid = playerIdRef.current;
        if (!code || !pid) {
          setStatusBanner('Conexión perdida con la sala.');
          return;
        }
        setSelectedSquare(null);
        setLegalMoves([]);
        syncSceneNow(null, []);
        fetch(`/api/rooms/${encodeURIComponent(code)}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: pid, from, to, promotion }),
        })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok) {
              setStatusBanner(data.error || 'No se pudo enviar la jugada.');
              return;
            }
            applyRoomUpdateRef.current({
              snapshot: data.snapshot,
              clock: data.clock,
              version: data.version,
              opponentConnected: true,
            });
          })
          .catch(() => {
            setStatusBanner('Error de red al enviar la jugada.');
          });
        return;
      }

      const res = engine.makeMove(from, to, promotion);
      if (!res) return;
      const snap = engine.getSnapshot();
      const wasCapture = Boolean(res.captured);
      setSnapshot(snap);
      setSelectedSquare(null);
      setLegalMoves([]);
      syncSceneNow(null, [], snap);
      playSoundForMove(snap, wasCapture, res.san.startsWith('O-'), res.piece as PieceType);

      if (snap.isGameOver) {
        if (!wasCapture) {
          setScreenState('gameover');
        }
      } else if (!wasCapture) {
        triggerAiTurnIfNeeded();
      }
    },
    [playSoundForMove, syncSceneNow, triggerAiTurnIfNeeded],
  );

  const handleSquareClick = useCallback(
    (square: string) => {
      const {
        screenState: curScreen,
        gameMode: mode,
        playerColor: myColor,
        selectedSquare: curSel,
        legalMoves: curMoves,
        isAiThinking: aiBusy,
        isCaptureAnimating: capturingBusy,
      } = stateRef.current;

      if (curScreen !== 'playing' || aiBusy || capturingBusy || pendingPromotion) return;
      const engine = engineRef.current;
      if (engine.isGameOver()) return;

      if (engine.getTurn() !== myColor) {
        if (mode === '2p') {
          setStatusBanner('Espera el turno de tu oponente.');
        }
        return;
      }
      setStatusBanner(null);

      if (curSel) {
        const target = curMoves.find((m) => m.to === square);
        if (target) {
          if (target.isPromotion) {
            setPendingPromotion({ from: curSel, to: square });
            return;
          }
          executePlayerMove(curSel, square);
          return;
        }
      }

      const clickedPiece = engine.getPieces().find((p) => p.square === square);
      if (clickedPiece && clickedPiece.color === myColor) {
        if (curSel === square) {
          setSelectedSquare(null);
          setLegalMoves([]);
          syncSceneNow(null, []);
          return;
        }
        const moves = engine.getLegalMovesFrom(square);
        draculaAudio.playSelect();
        setSelectedSquare(square);
        setLegalMoves(moves);
        syncSceneNow(square, moves);
        return;
      }

      if (curSel) {
        setSelectedSquare(null);
        setLegalMoves([]);
        syncSceneNow(null, []);
      }
    },
    [executePlayerMove, pendingPromotion, syncSceneNow],
  );

  const handleSquareClickRef = useRef(handleSquareClick);
  handleSquareClickRef.current = handleSquareClick;

  const handleCaptureStateChange = useCallback(
    (capturing: boolean) => {
      stateRef.current.isCaptureAnimating = capturing;
      setIsCaptureAnimating(capturing);
      if (!capturing) {
        const engine = engineRef.current;
        const snap = engine.getSnapshot();
        if (snap.isGameOver) {
          draculaAudio.playGameOver(snap.winner === stateRef.current.playerColor);
          setScreenState('gameover');
        } else if (
          stateRef.current.screenState === 'playing' &&
          stateRef.current.gameMode === '1p' &&
          engine.getTurn() !== stateRef.current.playerColor
        ) {
          triggerAiTurnIfNeeded();
        }
      }
    },
    [triggerAiTurnIfNeeded],
  );

  const handleCaptureStateChangeRef = useRef(handleCaptureStateChange);
  handleCaptureStateChangeRef.current = handleCaptureStateChange;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let scene: DraculaChessScene | null = null;
    try {
      scene = new DraculaChessScene(container, {
        onSquareClick: (sq) => handleSquareClickRef.current(sq),
        onCaptureStateChange: (capturing) => handleCaptureStateChangeRef.current(capturing),
        onContextLost: () => {
          setWebglUnavailable(true);
        },
      });
      sceneRef.current = scene;
      setWebglUnavailable(false);
      scene.syncState(
        engineRef.current.getPieces(),
        engineRef.current.getSnapshot(),
        null,
        [],
      );
      scene.setTitleMode(stateRef.current.screenState === 'title', stateRef.current.playerColor);
    } catch (err) {
      console.error('Error al iniciar escena 3D WebGL:', err);
      sceneRef.current = null;
      setWebglUnavailable(true);
    }

    return () => {
      clearAiTimer();
      closeSocket();
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [autostart, clearAiTimer, closeSocket, sceneRetryCount]);

  const startSinglePlayer = useCallback(
    (resolvedElo?: number) => {
      clearAiTimer();
      closeSocket(true);
      sceneRef.current?.cancelCaptureAnimation();
      (document.activeElement as HTMLElement | null)?.blur?.();

      const targetElo = clampElo(resolvedElo ?? stateRef.current.aiElo);
      setAiElo(targetElo);
      stateRef.current.aiElo = targetElo;

      engineRef.current.reset();
      const snap = engineRef.current.getSnapshot();
      setGameMode('1p');
      setPlayerColor('w');
      setRoomCode(null);
      setTwoPlayerStep(null);
      setClockState(null);
      setWsError(null);
      setStatusBanner(null);
      setSelectedSquare(null);
      setLegalMoves([]);
      setPendingPromotion(null);
      setIsAiThinking(false);
      setIsCaptureAnimating(false);
      setSnapshot(snap);
      setScreenState('playing');

      sceneRef.current?.setTitleMode(false, 'w');
      sceneRef.current?.syncState(engineRef.current.getPieces(), snap, null, []);
    },
    [clearAiTimer, closeSocket],
  );

  const applyRoomUpdate = useCallback(
    (payload: {
      snapshot: GameSnapshot;
      clock: ClockState;
      version?: number;
      opponentConnected?: boolean;
      opponentDisconnected?: boolean;
    }) => {
      if (
        typeof payload.version === 'number' &&
        payload.version <= roomVersionRef.current
      ) {
        return;
      }
      if (typeof payload.version === 'number') {
        roomVersionRef.current = payload.version;
      }

      if (payload.opponentConnected && !opponentJoinedNotifiedRef.current) {
        opponentJoinedNotifiedRef.current = true;
        setTwoPlayerStep(null);
        setStatusBanner(null);
        engineRef.current.loadFen(payload.snapshot.fen);
        setSnapshot(payload.snapshot);
        applyServerClock(payload.clock);
        setSelectedSquare(null);
        setLegalMoves([]);
        setScreenState('playing');
        sceneRef.current?.setTitleMode(false, stateRef.current.playerColor);
        sceneRef.current?.syncState(
          engineRef.current.getPieces(),
          payload.snapshot,
          null,
          [],
        );
        draculaAudio.playSelect();
        return;
      }

      const prevCount = engineRef.current.getPieces().length;
      const prevFen = engineRef.current.getFen();
      engineRef.current.loadFen(payload.snapshot.fen);
      const nextCount = engineRef.current.getPieces().length;
      const fenChanged = prevFen !== payload.snapshot.fen;
      const wasCapture =
        fenChanged && payload.snapshot.reason !== 'timeout' && nextCount < prevCount;
      const wasCastle =
        fenChanged && Boolean(payload.snapshot.lastMove?.san.startsWith('O-'));

      setSnapshot(payload.snapshot);
      applyServerClock(payload.clock);
      setSelectedSquare(null);
      setLegalMoves([]);
      setPendingPromotion(null);
      if (payload.opponentDisconnected) {
        setStatusBanner('El oponente se desconectó de la sala.');
      } else {
        setStatusBanner(null);
      }

      if (payload.snapshot.reason === 'timeout' || payload.snapshot.reason === 'opponent_left') {
        sceneRef.current?.cancelCaptureAnimation();
      }
      sceneRef.current?.syncState(
        engineRef.current.getPieces(),
        payload.snapshot,
        null,
        [],
      );
      if (fenChanged) {
        playSoundForMove(
          payload.snapshot,
          wasCapture,
          wasCastle,
          payload.snapshot.history[payload.snapshot.history.length - 1]?.piece,
        );
      }

      if (payload.snapshot.isGameOver && !wasCapture) {
        if (
          payload.snapshot.reason === 'timeout' ||
          payload.snapshot.reason === 'resignation' ||
          payload.snapshot.reason === 'opponent_left'
        ) {
          draculaAudio.playGameOver(payload.snapshot.winner === stateRef.current.playerColor);
        }
        setScreenState('gameover');
      } else if (!payload.snapshot.isGameOver && opponentJoinedNotifiedRef.current) {
        setScreenState('playing');
      }
    },
    [applyServerClock, playSoundForMove],
  );

  const applyRoomUpdateRef = useRef(applyRoomUpdate);
  applyRoomUpdateRef.current = applyRoomUpdate;

  const attachRoomPushSocket = useCallback(
    (playerId: string) => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(
          `${protocol}//${window.location.host}/ws?playerId=${encodeURIComponent(playerId)}`,
        );
        wsRef.current = ws;

        ws.onmessage = (event) => {
          let msg: ServerWsMessage;
          try {
            msg = JSON.parse(event.data) as ServerWsMessage;
          } catch {
            return;
          }
          if (msg.type === 'opponent_joined') {
            applyRoomUpdateRef.current({
              snapshot: msg.snapshot,
              clock: msg.clock,
              version: msg.version,
              opponentConnected: true,
            });
          } else if (msg.type === 'state_update' || msg.type === 'game_over') {
            applyRoomUpdateRef.current({
              snapshot: msg.snapshot,
              clock: msg.clock,
              version: msg.version,
              opponentConnected: true,
            });
          } else if (msg.type === 'opponent_disconnected') {
            setStatusBanner('El oponente se desconectó de la sala.');
          }
        };

        ws.onerror = () => {
          // Silent fallback: HTTP polling keeps the 2-player match synced smoothly
        };
      } catch {
        // Ignore WS failure; HTTP polling handles synchronization
      }
    },
    [],
  );

  // Adaptive HTTP polling fallback guarantees 2-player sync even if WebSockets are blocked by a proxy
  useEffect(() => {
    if (gameMode !== '2p' || !roomCode || !playerIdRef.current || p2pSessionRef.current) return;
    if (twoPlayerStep !== 'waiting' && screenState === 'title') return;

    let cancelled = false;
    let timerId: number | null = null;

    const poll = async () => {
      const pid = playerIdRef.current;
      if (cancelled || !pid || !roomCode) return;
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(roomCode)}/state?playerId=${encodeURIComponent(pid)}`,
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          applyRoomUpdateRef.current({
            snapshot: data.snapshot,
            clock: data.clock,
            version: data.version,
            opponentConnected: data.opponentConnected,
            opponentDisconnected: data.opponentDisconnected,
          });
        }
      } catch {
        // Ignore transient network poll glitch and retry
      } finally {
        if (!cancelled) {
          const wsOpen = wsRef.current?.readyState === WebSocket.OPEN;
          const delay = wsOpen ? 1400 : twoPlayerStep === 'waiting' ? 350 : 420;
          timerId = window.setTimeout(poll, delay);
        }
      }
    };

    timerId = window.setTimeout(poll, 280);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [gameMode, roomCode, screenState, twoPlayerStep]);

  const detectTransportMode = useCallback(async (): Promise<'server' | 'p2p'> => {
    if (transportModeRef.current) return transportModeRef.current;
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.mode === 'server') {
          transportModeRef.current = 'server';
          return 'server';
        }
      }
    } catch {
      // Static / serverless host without persistent room backend
    }
    transportModeRef.current = 'p2p';
    return 'p2p';
  }, []);

  const handleCreateRoom = useCallback(async () => {
    closeSocket(true);
    setWsError(null);
    setIsConnecting(true);
    setTwoPlayerStep('creating');
    setRoomCode(null);

    const mode = await detectTransportMode();
    if (mode === 'p2p') {
      try {
        const created = await createP2PHostRoom(timeControlMinutes, {
          onUpdate: (update) => applyRoomUpdateRef.current(update),
          onClockSync: (clock) => applyServerClock(clock),
          onError: (message) => setStatusBanner(message),
        });
        p2pSessionRef.current = created.session;
        roomVersionRef.current = created.version;
        opponentJoinedNotifiedRef.current = false;

        setIsConnecting(false);
        setGameMode('2p');
        setPlayerColor(created.color);
        setRoomCode(created.code);
        setTwoPlayerStep('waiting');
        engineRef.current.loadFen(created.snapshot.fen);
        setSnapshot(created.snapshot);
        applyServerClock(created.clock);
      } catch (err) {
        setIsConnecting(false);
        setWsError(
          err instanceof Error
            ? err.message
            : 'No se pudo conectar con el servicio de partidas. Pulsa Reintentar.',
        );
      }
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeControlMinutes }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.code || !data.playerId) {
        throw new Error(data.error || 'No se pudo crear la sala en línea.');
      }

      playerIdRef.current = data.playerId;
      roomVersionRef.current = data.version ?? 1;
      opponentJoinedNotifiedRef.current = false;

      setIsConnecting(false);
      setGameMode('2p');
      setPlayerColor(data.color ?? 'w');
      setRoomCode(data.code);
      setTwoPlayerStep('waiting');
      engineRef.current.loadFen(data.snapshot.fen);
      setSnapshot(data.snapshot);
      applyServerClock(data.clock);
      attachRoomPushSocket(data.playerId);
    } catch {
      setIsConnecting(false);
      setWsError('No se pudo conectar con el servidor de partidas. Pulsa Reintentar.');
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [
    applyServerClock,
    attachRoomPushSocket,
    closeSocket,
    detectTransportMode,
    timeControlMinutes,
  ]);

  const handleJoinRoom = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim().toLowerCase();
      closeSocket(true);
      setWsError(null);
      setIsConnecting(true);

      const mode = await detectTransportMode();
      if (mode === 'p2p') {
        try {
          const joined = await joinP2PGuestRoom(code, {
            onUpdate: (update) => applyRoomUpdateRef.current(update),
            onClockSync: (clock) => applyServerClock(clock),
            onError: (message) => setStatusBanner(message),
          });
          p2pSessionRef.current = joined.session;
          roomVersionRef.current = joined.version;
          opponentJoinedNotifiedRef.current = true;

          setIsConnecting(false);
          setGameMode('2p');
          setPlayerColor(joined.color);
          setRoomCode(joined.code);
          setTwoPlayerStep(null);
          setStatusBanner(null);
          engineRef.current.loadFen(joined.snapshot.fen);
          setSnapshot(joined.snapshot);
          applyServerClock(joined.clock);
          setSelectedSquare(null);
          setLegalMoves([]);
          setScreenState('playing');
          sceneRef.current?.setTitleMode(false, joined.color);
          sceneRef.current?.syncState(
            engineRef.current.getPieces(),
            joined.snapshot,
            null,
            [],
          );
        } catch (err) {
          setIsConnecting(false);
          setWsError(
            err instanceof Error
              ? err.message
              : 'No se pudo conectar con la partida en línea.',
          );
        }
        return;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.playerId) {
          throw new Error(data.error || 'No se pudo unir a la partida.');
        }

        playerIdRef.current = data.playerId;
        roomVersionRef.current = data.version ?? 2;
        opponentJoinedNotifiedRef.current = true;

        setIsConnecting(false);
        setGameMode('2p');
        setPlayerColor(data.color ?? 'b');
        setRoomCode(data.code);
        setTwoPlayerStep(null);
        setStatusBanner(null);
        engineRef.current.loadFen(data.snapshot.fen);
        setSnapshot(data.snapshot);
        applyServerClock(data.clock);
        setSelectedSquare(null);
        setLegalMoves([]);
        setScreenState('playing');
        sceneRef.current?.setTitleMode(false, data.color ?? 'b');
        sceneRef.current?.syncState(
          engineRef.current.getPieces(),
          data.snapshot,
          null,
          [],
        );
        attachRoomPushSocket(data.playerId);
      } catch (err) {
        setIsConnecting(false);
        setWsError(
          err instanceof Error && err.name !== 'AbortError'
            ? err.message
            : 'No se pudo conectar con el servidor de partidas.',
        );
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [applyServerClock, attachRoomPushSocket, closeSocket, detectTransportMode],
  );

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      draculaAudio.setMuted(next);
      return next;
    });
  }, []);

  const handleTogglePause = useCallback(() => {
    setScreenState((prev) => {
      if (prev === 'playing') return 'paused';
      if (prev === 'paused') return 'playing';
      return prev;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (gameMode !== '1p' || isAiThinking || isCaptureAnimating || snapshot.isGameOver) return;
    sceneRef.current?.cancelCaptureAnimation();
    const engine = engineRef.current;
    engine.undoLastMove();
    engine.undoLastMove();
    const snap = engine.getSnapshot();
    setSnapshot(snap);
    setSelectedSquare(null);
    setLegalMoves([]);
    syncSceneNow(null, [], snap);
    draculaAudio.playSelect();
  }, [gameMode, isAiThinking, isCaptureAnimating, snapshot.isGameOver, syncSceneNow]);

  const handleResign = useCallback(() => {
    if (snapshot.isGameOver) return;
    sceneRef.current?.cancelCaptureAnimation();
    if (gameMode === '2p' && p2pSessionRef.current) {
      p2pSessionRef.current.resign();
      return;
    }
    if (gameMode === '2p' && roomCode && playerIdRef.current) {
      fetch(`/api/rooms/${encodeURIComponent(roomCode)}/resign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: playerIdRef.current }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            applyRoomUpdateRef.current({
              snapshot: data.snapshot,
              clock: data.clock,
              version: data.version,
              opponentConnected: true,
            });
          }
        })
        .catch(() => {});
      return;
    }
    engineRef.current.resign(playerColor);
    const snap = engineRef.current.getSnapshot();
    setSnapshot(snap);
    setSelectedSquare(null);
    setLegalMoves([]);
    syncSceneNow(null, [], snap);
    draculaAudio.playGameOver(false);
    setScreenState('gameover');
  }, [gameMode, playerColor, roomCode, snapshot.isGameOver, syncSceneNow]);

  const handleRestart = useCallback(() => {
    sceneRef.current?.cancelCaptureAnimation();
    if (gameMode === '2p' && p2pSessionRef.current) {
      p2pSessionRef.current.rematch();
      return;
    }
    if (gameMode === '2p' && roomCode && playerIdRef.current) {
      fetch(`/api/rooms/${encodeURIComponent(roomCode)}/rematch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: playerIdRef.current }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            applyRoomUpdateRef.current({
              snapshot: data.snapshot,
              clock: data.clock,
              version: data.version,
              opponentConnected: true,
            });
          }
        })
        .catch(() => {});
      return;
    }
    startSinglePlayer();
  }, [gameMode, roomCode, startSinglePlayer]);

  const handleReturnToTitle = useCallback(() => {
    clearAiTimer();
    closeSocket(true);
    sceneRef.current?.cancelCaptureAnimation();
    engineRef.current.reset();
    const snap = engineRef.current.getSnapshot();
    setSnapshot(snap);
    setSelectedSquare(null);
    setLegalMoves([]);
    setPendingPromotion(null);
    setIsAiThinking(false);
    setIsCaptureAnimating(false);
    setTwoPlayerStep(null);
    setRoomCode(null);
    setClockState(null);
    setWsError(null);
    setStatusBanner(null);
    setScreenState('title');
    sceneRef.current?.setTitleMode(true, 'w');
    sceneRef.current?.syncState(engineRef.current.getPieces(), snap, null, []);
  }, [clearAiTimer, closeSocket]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (screenState === 'title' && !twoPlayerStep) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startSinglePlayer();
        }
        return;
      }

      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        if (screenState === 'playing' || screenState === 'paused') {
          e.preventDefault();
          handleTogglePause();
        }
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        handleToggleMute();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleToggleMute,
    handleTogglePause,
    screenState,
    startSinglePlayer,
    twoPlayerStep,
  ]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#090608]">
      <div
        ref={mountRef}
        className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_42%,#24070e_0%,#0c0609_60%,#050304_100%)]"
      />

      {webglUnavailable && screenState !== 'title' && (
        <FallbackBoard2D
          pieces={engineRef.current.getPieces()}
          playerColor={playerColor}
          selectedSquare={selectedSquare}
          legalMoves={legalMoves}
          lastMove={snapshot.lastMove}
          onSquareClick={handleSquareClick}
          onRetryWebGL={() => setSceneRetryCount((c) => c + 1)}
        />
      )}

      {screenState === 'title' && (
        <DraculaTitleOverlay
          aiElo={aiElo}
          onChangeAiElo={setAiElo}
          onStartSinglePlayer={startSinglePlayer}
          twoPlayerStep={twoPlayerStep}
          timeControlMinutes={timeControlMinutes}
          onChangeTimeControl={setTimeControlMinutes}
          onOpenTwoPlayer={() => {
            setWsError(null);
            setTwoPlayerStep('choose');
          }}
          onBackToMain={() => {
            closeSocket(true);
            setTwoPlayerStep(null);
            setRoomCode(null);
            setClockState(null);
            setWsError(null);
            setIsConnecting(false);
          }}
          onCreateRoom={handleCreateRoom}
          onOpenJoinForm={() => {
            setWsError(null);
            setTwoPlayerStep('joining');
          }}
          onJoinRoom={handleJoinRoom}
          roomCode={roomCode}
          errorMessage={wsError}
          isConnecting={isConnecting}
        />
      )}

      {screenState !== 'title' && (
        <GameHud
          screenState={screenState}
          gameMode={gameMode}
          playerColor={playerColor}
          roomCode={roomCode}
          snapshot={snapshot}
          clockState={clockState}
          clockDisplay={clockDisplay}
          isAiThinking={isAiThinking}
          muted={muted}
          pendingPromotion={pendingPromotion}
          onSelectPromotion={(piece) => {
            if (!pendingPromotion) return;
            const { from, to } = pendingPromotion;
            setPendingPromotion(null);
            executePlayerMove(from, to, piece);
          }}
          onCancelPromotion={() => setPendingPromotion(null)}
          onToggleMute={handleToggleMute}
          onTogglePause={handleTogglePause}
          onResetCamera={() => sceneRef.current?.focusCameraForTeam(playerColor)}
          onZoomIn={() => sceneRef.current?.zoomBy(0.84)}
          onZoomOut={() => sceneRef.current?.zoomBy(1.18)}
          onUndo={handleUndo}
          onResign={handleResign}
          onRestart={handleRestart}
          onReturnToTitle={handleReturnToTitle}
          statusBanner={statusBanner}
        />
      )}
    </main>
  );
}
