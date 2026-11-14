import { useCallback, useEffect, useRef, useState } from 'react';
import { draculaAudio } from './audio/draculaAudio';
import { chooseAiMove, clampElo } from './chess/ai';
import type { AiWorkerRequest, AiWorkerResponse } from './chess/ai.worker';
import { computeDisplayClockMs } from './chess/clock';
import { DraculaChessEngine } from './chess/engine';
import type {
  AppScreenState,
  ClientWsMessage,
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
import { GameHud } from './components/GameHud';
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

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
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
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !code) {
          setStatusBanner('Conexión perdida con la sala.');
          return;
        }
        const payload: ClientWsMessage = {
          type: 'make_move',
          code,
          from,
          to,
          promotion,
        };
        wsRef.current.send(JSON.stringify(payload));
        setSelectedSquare(null);
        setLegalMoves([]);
        syncSceneNow(null, []);
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

    const scene = new DraculaChessScene(container, {
      onSquareClick: (sq) => handleSquareClickRef.current(sq),
      onCaptureStateChange: (capturing) => handleCaptureStateChangeRef.current(capturing),
    });
    sceneRef.current = scene;
    scene.syncState(
      engineRef.current.getPieces(),
      engineRef.current.getSnapshot(),
      null,
      [],
    );
    scene.setTitleMode(!autostart, 'w');

    return () => {
      clearAiTimer();
      closeSocket();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [autostart, clearAiTimer, closeSocket]);

  const startSinglePlayer = useCallback(
    (resolvedElo?: number) => {
      clearAiTimer();
      closeSocket();
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

  const connectWebSocket = useCallback(
    (onOpenMsg: ClientWsMessage) => {
      closeSocket();
      setWsError(null);
      setIsConnecting(true);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify(onOpenMsg));
      };

      ws.onmessage = (event) => {
        let msg: ServerWsMessage;
        try {
          msg = JSON.parse(event.data) as ServerWsMessage;
        } catch {
          return;
        }

        if (msg.type === 'error') {
          setIsConnecting(false);
          setWsError(msg.message);
          setStatusBanner(msg.message);
          return;
        }

        if (msg.type === 'room_created') {
          setIsConnecting(false);
          setGameMode('2p');
          setPlayerColor(msg.color);
          setRoomCode(msg.code);
          setTwoPlayerStep('waiting');
          engineRef.current.loadFen(msg.snapshot.fen);
          setSnapshot(msg.snapshot);
          applyServerClock(msg.clock);
          return;
        }

        if (msg.type === 'room_joined') {
          setIsConnecting(false);
          setGameMode('2p');
          setPlayerColor(msg.color);
          setRoomCode(msg.code);
          setTwoPlayerStep(null);
          setStatusBanner(null);
          engineRef.current.loadFen(msg.snapshot.fen);
          setSnapshot(msg.snapshot);
          applyServerClock(msg.clock);
          setSelectedSquare(null);
          setLegalMoves([]);
          setScreenState('playing');
          sceneRef.current?.setTitleMode(false, msg.color);
          sceneRef.current?.syncState(
            engineRef.current.getPieces(),
            msg.snapshot,
            null,
            [],
          );
          return;
        }

        if (msg.type === 'opponent_joined') {
          setTwoPlayerStep(null);
          setStatusBanner(null);
          engineRef.current.loadFen(msg.snapshot.fen);
          setSnapshot(msg.snapshot);
          applyServerClock(msg.clock);
          setSelectedSquare(null);
          setLegalMoves([]);
          setScreenState('playing');
          sceneRef.current?.setTitleMode(false, 'w');
          sceneRef.current?.syncState(
            engineRef.current.getPieces(),
            msg.snapshot,
            null,
            [],
          );
          draculaAudio.playSelect();
          return;
        }

        if (msg.type === 'state_update' || msg.type === 'game_over') {
          const prevCount = engineRef.current.getPieces().length;
          engineRef.current.loadFen(msg.snapshot.fen);
          const nextCount = engineRef.current.getPieces().length;
          const wasCapture = msg.snapshot.reason !== 'timeout' && nextCount < prevCount;
          const wasCastle = Boolean(msg.snapshot.lastMove?.san.startsWith('O-'));

          setSnapshot(msg.snapshot);
          applyServerClock(msg.clock);
          setSelectedSquare(null);
          setLegalMoves([]);
          setPendingPromotion(null);
          setStatusBanner(null);
          if (msg.snapshot.reason === 'timeout') {
            sceneRef.current?.cancelCaptureAnimation();
          }
          sceneRef.current?.syncState(
            engineRef.current.getPieces(),
            msg.snapshot,
            null,
            [],
          );
          playSoundForMove(
            msg.snapshot,
            wasCapture,
            wasCastle,
            msg.snapshot.history[msg.snapshot.history.length - 1]?.piece,
          );

          if ((msg.type === 'game_over' || msg.snapshot.isGameOver) && !wasCapture) {
            if (msg.snapshot.reason === 'timeout') {
              draculaAudio.playGameOver(msg.snapshot.winner === stateRef.current.playerColor);
            }
            setScreenState('gameover');
          } else if (!msg.snapshot.isGameOver) {
            setScreenState('playing');
          }
          return;
        }

        if (msg.type === 'opponent_disconnected') {
          setStatusBanner('El oponente se desconectó de la sala.');
        }
      };

      ws.onerror = () => {
        setIsConnecting(false);
        setWsError('No se pudo conectar con el servidor de partidas.');
      };

      ws.onclose = () => {
        setIsConnecting(false);
      };
    },
    [applyServerClock, closeSocket, playSoundForMove],
  );

  const handleCreateRoom = useCallback(() => {
    setTwoPlayerStep('creating');
    setRoomCode(null);
    connectWebSocket({ type: 'create_room', timeControlMinutes });
  }, [connectWebSocket, timeControlMinutes]);

  const handleJoinRoom = useCallback(
    (code: string) => {
      connectWebSocket({ type: 'join_room', code });
    },
    [connectWebSocket],
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
    if (gameMode === '2p' && wsRef.current?.readyState === WebSocket.OPEN && roomCode) {
      const msg: ClientWsMessage = { type: 'resign', code: roomCode };
      wsRef.current.send(JSON.stringify(msg));
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
    if (gameMode === '2p' && wsRef.current?.readyState === WebSocket.OPEN && roomCode) {
      const msg: ClientWsMessage = { type: 'request_rematch', code: roomCode };
      wsRef.current.send(JSON.stringify(msg));
      return;
    }
    startSinglePlayer();
  }, [gameMode, roomCode, startSinglePlayer]);

  const handleReturnToTitle = useCallback(() => {
    clearAiTimer();
    closeSocket();
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
      <div ref={mountRef} className="fixed inset-0 z-0" />

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
            closeSocket();
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
