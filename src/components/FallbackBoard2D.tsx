import type { ChessPieceInfo, LegalMoveTarget, TeamColor } from '../chess/types';
import { PieceMiniIcon } from './PieceIcons';

interface FallbackBoard2DProps {
  pieces: ChessPieceInfo[];
  playerColor: TeamColor;
  selectedSquare: string | null;
  legalMoves: LegalMoveTarget[];
  lastMove: { from: string; to: string } | null;
  onSquareClick: (square: string) => void;
  onRetryWebGL: () => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export function FallbackBoard2D({
  pieces,
  playerColor,
  selectedSquare,
  legalMoves,
  lastMove,
  onSquareClick,
  onRetryWebGL,
}: FallbackBoard2DProps) {
  const pieceBySq = new Map<string, ChessPieceInfo>();
  for (const p of pieces) pieceBySq.set(p.square, p);

  const legalSet = new Set(legalMoves.map((m) => m.to));
  const captureSet = new Set(legalMoves.filter((m) => m.isCapture).map((m) => m.to));

  const files = playerColor === 'w' ? FILES : [...FILES].reverse();
  const ranks = playerColor === 'w' ? RANKS : [...RANKS].reverse();

  return (
    <div className="fixed inset-0 z-0 flex flex-col items-center justify-center bg-[#090608] p-4">
      <div className="mb-3 flex items-center gap-3 rounded-xl bg-[#140b0e] border border-[#6e1522] px-3.5 py-2 text-xs text-[#dfd1d3]">
        <span>Modo 2D activo (WebGL 3D no disponible en este navegador).</span>
        <button
          type="button"
          onClick={onRetryWebGL}
          className="px-2.5 py-1 rounded-lg bg-[#d61126] hover:bg-[#ef1830] text-white font-bold cursor-pointer"
        >
          Reintentar 3D
        </button>
      </div>

      <div className="w-[min(86vw,520px)] aspect-square grid grid-cols-8 grid-rows-8 rounded-xl overflow-hidden border-4 border-[#6e1522] shadow-[0_20px_60px_rgba(0,0,0,0.9)]">
        {ranks.map((rank) =>
          files.map((file) => {
            const sq = `${file}${rank}`;
            const fileIdx = FILES.indexOf(file);
            const rankIdx = Number(rank) - 1;
            const isRedSq = (fileIdx + rankIdx) % 2 === 1;
            const piece = pieceBySq.get(sq);
            const isSelected = selectedSquare === sq;
            const isLegal = legalSet.has(sq);
            const isCapture = captureSet.has(sq);
            const isLast = lastMove?.from === sq || lastMove?.to === sq;

            return (
              <button
                key={sq}
                type="button"
                aria-label={`Casilla ${sq}`}
                onClick={() => onSquareClick(sq)}
                className={`relative flex items-center justify-center cursor-pointer transition-colors ${
                  isRedSq ? 'bg-[#6b0d1b]' : 'bg-[#0d3b27]'
                } ${isSelected ? 'ring-3 ring-inset ring-[#ff4d63]' : ''} ${
                  isLast ? 'brightness-125' : ''
                }`}
              >
                {piece && (
                  <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
                    <PieceMiniIcon type={piece.type} color={piece.color} size={34} />
                  </span>
                )}
                {isLegal && !isCapture && (
                  <span className="absolute w-3.5 h-3.5 rounded-full bg-[#ff4d63]/75 pointer-events-none" />
                )}
                {isCapture && (
                  <span className="absolute inset-1 rounded-full border-3 border-[#ff2a43] pointer-events-none" />
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
