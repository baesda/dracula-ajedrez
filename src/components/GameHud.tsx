import { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Undo2,
  Flag,
  ChevronDown,
  ChevronUp,
  Home,
  Clock,
} from 'lucide-react';
import { formatClockTime } from '../chess/clock';
import type {
  AppScreenState,
  ClockState,
  GameMode,
  GameSnapshot,
  PieceType,
  TeamColor,
} from '../chess/types';
import { PieceMiniIcon } from './PieceIcons';

interface GameHudProps {
  screenState: AppScreenState;
  gameMode: GameMode;
  playerColor: TeamColor;
  roomCode: string | null;
  snapshot: GameSnapshot;
  clockState: ClockState | null;
  clockDisplay: { wMs: number; bMs: number };
  isAiThinking: boolean;
  muted: boolean;
  pendingPromotion: { from: string; to: string } | null;
  onSelectPromotion: (piece: PieceType) => void;
  onCancelPromotion: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onResetCamera: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onUndo: () => void;
  onResign: () => void;
  onRestart: () => void;
  onReturnToTitle: () => void;
  statusBanner: string | null;
}

function getReasonLabel(reason: GameSnapshot['reason']): string {
  switch (reason) {
    case 'checkmate':
      return 'Jaque Mate';
    case 'stalemate':
      return 'Tablas por Ahogado';
    case 'threefold':
      return 'Tablas por Repetición';
    case 'insufficient':
      return 'Tablas por Material Insuficiente';
    case 'fifty_moves':
      return 'Tablas (Regla de 50 Jugadas)';
    case 'resignation':
      return 'Rendición';
    case 'opponent_left':
      return 'El rival abandonó la sala';
    case 'timeout':
      return 'Tiempo agotado';
    default:
      return 'Partida Finalizada';
  }
}

export function GameHud({
  screenState,
  gameMode,
  playerColor,
  roomCode,
  snapshot,
  clockState,
  clockDisplay,
  isAiThinking,
  muted,
  pendingPromotion,
  onSelectPromotion,
  onCancelPromotion,
  onToggleMute,
  onTogglePause,
  onResetCamera,
  onZoomIn,
  onZoomOut,
  onUndo,
  onResign,
  onRestart,
  onReturnToTitle,
  statusBanner,
}: GameHudProps) {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const showClocks = gameMode === '2p' && clockState !== null;
  const redActive = showClocks && clockState.activeTurn === 'w' && !snapshot.isGameOver;
  const greenActive = showClocks && clockState.activeTurn === 'b' && !snapshot.isGameOver;
  const redLow = clockDisplay.wMs < 60_000;
  const greenLow = clockDisplay.bMs < 60_000;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none">
      {/* 2-Player Only Clocks: Red Top-Left & Green Top-Right (NO clock vs AI robot) */}
      {showClocks && (
        <>
          <div
            data-testid="clock-red"
            className={`absolute top-4 left-4 pointer-events-auto rounded-xl px-3.5 py-2 border-2 shadow-[0_12px_30px_rgba(0,0,0,0.8)] transition-colors ${
              redActive
                ? redLow
                  ? 'bg-[#2a070d]/95 border-[#ff2a43] shadow-[0_0_24px_rgba(255,34,58,0.45)]'
                  : 'bg-[#1a0a0e]/95 border-[#d61126] shadow-[0_0_20px_rgba(214,17,38,0.35)]'
                : 'bg-[#0e090b]/90 border-[#4a1821] opacity-85'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#ff8a98]">
              <span className="w-2 h-2 rounded-full bg-[#e61229]" />
              <span>Piezas Rojas</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className="w-4 h-4 text-[#ff4d63]" />
              <span
                className={`font-mono text-xl md:text-2xl font-black tabular-nums leading-none ${
                  redActive && redLow ? 'text-[#ff5c70]' : 'text-white'
                }`}
              >
                {formatClockTime(clockDisplay.wMs)}
              </span>
            </div>
          </div>

          <div
            data-testid="clock-green"
            className={`absolute top-4 right-4 pointer-events-auto rounded-xl px-3.5 py-2 border-2 shadow-[0_12px_30px_rgba(0,0,0,0.8)] transition-colors ${
              greenActive
                ? greenLow
                  ? 'bg-[#2a070d]/95 border-[#ff2a43] shadow-[0_0_24px_rgba(255,34,58,0.45)]'
                  : 'bg-[#081711]/95 border-[#139c57] shadow-[0_0_20px_rgba(19,156,87,0.35)]'
                : 'bg-[#090e0c]/90 border-[#18472e] opacity-85'
            }`}
          >
            <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#68e6a2]">
              <span>Piezas Verdes</span>
              <span className="w-2 h-2 rounded-full bg-[#16c46a]" />
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <Clock className="w-4 h-4 text-[#23d97b]" />
              <span
                className={`font-mono text-xl md:text-2xl font-black tabular-nums leading-none ${
                  greenActive && greenLow ? 'text-[#ff5c70]' : 'text-white'
                }`}
              >
                {formatClockTime(clockDisplay.bMs)}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Minimal Contextual Alerts Only (no Turn/Move menu!) */}
      {(roomCode || (snapshot.inCheck && !snapshot.isGameOver) || statusBanner) && (
        <div
          className={`absolute pointer-events-auto flex items-center gap-2 flex-wrap ${
            showClocks
              ? 'top-16 left-1/2 -translate-x-1/2 justify-center'
              : 'top-4 left-4'
          }`}
        >
          {gameMode === '2p' && roomCode && (
            <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-[#0f090c]/92 border border-[#6e1522] text-[#ff6b7d]">
              Sala: {roomCode}
            </span>
          )}

          {snapshot.inCheck && !snapshot.isGameOver && (
            <span className="text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-xl bg-[#d61126] text-white shadow-lg">
              ¡Jaque!
            </span>
          )}

          {statusBanner && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#0f090c]/92 border border-[#6e1522] text-[#ff7a88]">
              {statusBanner}
            </span>
          )}
        </div>
      )}

      {/* Compact Utility Buttons (top-center in 2P so clocks own top-left/top-right; top-right in 1P) */}
      <div
        className={`absolute top-4 flex items-center gap-2 pointer-events-auto ${
          showClocks ? 'left-1/2 -translate-x-1/2' : 'right-4'
        }`}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={muted ? 'Activar sonido [M]' : 'Silenciar sonido [M]'}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          className="w-10 h-10 rounded-xl bg-[#0f090c]/92 hover:bg-[#231218] border border-[#6e1522] flex items-center justify-center text-[#f5ece8] cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4 text-[#ff6b7d]" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Pausa [P]"
          onClick={(e) => {
            e.currentTarget.blur();
            onTogglePause();
          }}
          className="w-10 h-10 rounded-xl bg-[#0f090c]/92 hover:bg-[#231218] border border-[#6e1522] flex items-center justify-center text-[#f5ece8] cursor-pointer"
        >
          <Pause className="w-4 h-4" />
        </button>
      </div>

      {/* Collapsible Bottom Control Dock */}
      <div className="fixed bottom-4 left-[calc(50%+26px)] sm:left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto max-w-[calc(100vw-88px)] sm:max-w-[94vw]">
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            setDockCollapsed((prev) => !prev);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-[#140b0e]/95 border border-b-0 border-[#5e1722] text-[11px] font-semibold text-[#d4c2c5] hover:text-white cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Mostrar controles</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Ocultar controles</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="flex items-center gap-1.5 md:gap-2 px-3 py-2 rounded-xl bg-[#0f090c]/95 border border-[#6e1522] shadow-[0_14px_40px_rgba(0,0,0,0.85)] flex-wrap justify-center">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onResetCamera();
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1b1216] hover:bg-[#2b1a20] text-xs font-semibold text-[#f5ece8] border border-[#4a1a22] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#e61229]" />
              <span>Centrar</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Acercar zoom"
              onClick={(e) => {
                e.currentTarget.blur();
                onZoomIn();
              }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#1b1216] hover:bg-[#2b1a20] text-[#f5ece8] border border-[#4a1a22] cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Alejar zoom"
              onClick={(e) => {
                e.currentTarget.blur();
                onZoomOut();
              }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#1b1216] hover:bg-[#2b1a20] text-[#f5ece8] border border-[#4a1a22] cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            {gameMode === '1p' && (
              <button
                type="button"
                tabIndex={-1}
                disabled={snapshot.history.length < 2 || isAiThinking || snapshot.isGameOver}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onUndo();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1b1216] hover:bg-[#2b1a20] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-[#f5ece8] border border-[#4a1a22] cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Deshacer</span>
              </button>
            )}

            {!snapshot.isGameOver && (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onResign();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#241015] hover:bg-[#3b151e] text-xs font-semibold text-[#ff8a98] border border-[#751827] cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Rendirse</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pawn Promotion Modal */}
      {pendingPromotion && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 pointer-events-auto p-4">
          <div className="rounded-2xl bg-[#110a0d] border-2 border-[#d61126] p-6 max-w-sm w-full shadow-2xl text-center">
            <h2 className="font-gothic text-xl font-bold text-white mb-1">
              Coronación
            </h2>
            <p className="text-xs text-[#cbb6ba] mb-4">
              Elige en qué pieza se transforma tu peón:
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { type: 'q', label: 'Reina' },
                  { type: 'r', label: 'Torre' },
                  { type: 'b', label: 'Alfil' },
                  { type: 'n', label: 'Caballo' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => onSelectPromotion(opt.type)}
                  className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-[#1e1217] hover:bg-[#d61126] border border-[#6e1522] text-sm font-bold text-white transition-colors cursor-pointer"
                >
                  <PieceMiniIcon type={opt.type} color={playerColor} size={22} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onCancelPromotion}
              className="mt-4 text-xs text-[#b89fa3] hover:text-white cursor-pointer"
            >
              Cancelar movimiento
            </button>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {screenState === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 pointer-events-auto p-4">
          <div className="rounded-2xl bg-[#110a0d] border-2 border-[#8c1625] p-6 max-w-xs w-full shadow-2xl text-center space-y-3">
            <h2 className="font-gothic text-2xl font-black text-white">Pausa</h2>
            <p className="text-xs text-[#cbb6ba]">
              {gameMode === '2p' && roomCode
                ? `Sala en línea: ${roomCode}`
                : 'Partida contra el Robot'}
            </p>
            <button
              type="button"
              onClick={onTogglePause}
              className="w-full py-3 rounded-xl bg-[#d61126] hover:bg-[#ef1830] text-white font-bold text-sm cursor-pointer"
            >
              Continuar
            </button>
            {gameMode === '1p' && (
              <button
                type="button"
                onClick={onRestart}
                className="w-full py-2.5 rounded-xl bg-[#1b1216] hover:bg-[#2a1a20] border border-[#5e1722] text-[#f5ece8] font-semibold text-sm cursor-pointer"
              >
                Reiniciar partida
              </button>
            )}
            <button
              type="button"
              onClick={onReturnToTitle}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#140d10] hover:bg-[#211519] border border-[#3d1c22] text-[#cbb6ba] font-semibold text-sm cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Menú principal</span>
            </button>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {screenState === 'gameover' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 pointer-events-auto p-4">
          <div className="rounded-2xl bg-[#110a0d] border-2 border-[#d61126] p-6 md:p-7 max-w-sm w-full shadow-[0_24px_60px_rgba(0,0,0,0.9)] text-center space-y-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-[#ff6b7d] font-bold">
                {getReasonLabel(snapshot.reason)}
              </span>
              <h2 className="font-gothic text-2xl md:text-3xl font-black text-white mt-1">
                {snapshot.winner === null
                  ? 'Tablas'
                  : snapshot.winner === playerColor
                  ? '¡Victoria!'
                  : gameMode === '1p'
                  ? 'Derrota'
                  : snapshot.winner === 'w'
                  ? 'Gana Rojo'
                  : 'Gana Oscuro'}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-[#1a1014] border border-[#4a1a22] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#b89fa3]">
                  Jugadas
                </div>
                <div className="text-xl font-black text-white tabular-nums mt-0.5">
                  {snapshot.moveNumber}
                </div>
              </div>
              <div className="rounded-xl bg-[#1a1014] border border-[#4a1a22] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#b89fa3]">
                  Capturas
                </div>
                <div className="text-xl font-black text-white tabular-nums mt-0.5">
                  {snapshot.capturedByRed.length + snapshot.capturedByBlack.length}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={onRestart}
                className="w-full py-3 rounded-xl bg-[#d61126] hover:bg-[#ef1830] text-white font-bold text-sm cursor-pointer"
              >
                Jugar de nuevo
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="w-full py-2.5 rounded-xl bg-[#181216] hover:bg-[#241a20] border border-[#5e1722] text-[#dfd1d3] font-semibold text-sm cursor-pointer"
              >
                Menú principal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
