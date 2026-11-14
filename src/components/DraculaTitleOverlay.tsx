import { useState } from 'react';
import { Copy, Check, Crown, Users, User, ArrowLeft, Loader2, Clock } from 'lucide-react';
import { ALLOWED_TIME_CONTROLS } from '../chess/clock';
import { clampElo } from '../chess/ai';
import { MAX_AI_ELO, MIN_AI_ELO, type TimeControlMinutes } from '../chess/types';

export type TwoPlayerStep = 'choose' | 'creating' | 'waiting' | 'joining';

interface DraculaTitleOverlayProps {
  aiElo: number;
  onChangeAiElo: (elo: number) => void;
  onStartSinglePlayer: (resolvedElo: number) => void;
  twoPlayerStep: TwoPlayerStep | null;
  timeControlMinutes: TimeControlMinutes;
  onChangeTimeControl: (minutes: TimeControlMinutes) => void;
  onOpenTwoPlayer: () => void;
  onBackToMain: () => void;
  onCreateRoom: () => void;
  onOpenJoinForm: () => void;
  onJoinRoom: (code: string) => void;
  roomCode: string | null;
  errorMessage: string | null;
  isConnecting: boolean;
}

function getEloTierDescription(elo: number): string {
  if (elo >= 4000) return 'Supremo (5000) · Cálculo profundo presente y futuro sobrehumano';
  if (elo >= 2500) return 'Gran Maestro · Repertorio magistral y previsión avanzada';
  if (elo >= 1400) return 'Maestro de Club · Táctica y planificación posicional';
  if (elo >= 400) return 'Aficionado · Prevé jugadas a corto plazo';
  return 'Principiante · Piensa solo en el presente con jugadas ingenuas';
}

export function DraculaTitleOverlay({
  aiElo,
  onChangeAiElo,
  onStartSinglePlayer,
  twoPlayerStep,
  timeControlMinutes,
  onChangeTimeControl,
  onOpenTwoPlayer,
  onBackToMain,
  onCreateRoom,
  onOpenJoinForm,
  onJoinRoom,
  roomCode,
  errorMessage,
  isConnecting,
}: DraculaTitleOverlayProps) {
  const [eloText, setEloText] = useState(() => String(aiElo));
  const [joinInput, setJoinInput] = useState('');
  const [copied, setCopied] = useState(false);

  const parsedElo = clampElo(Number(eloText));

  const commitElo = (valStr: string) => {
    const num = Number(valStr);
    const clamped = clampElo(num);
    setEloText(String(clamped));
    onChangeAiElo(clamped);
    return clamped;
  };

  const handleCopy = () => {
    if (!roomCode) return;
    navigator.clipboard?.writeText(roomCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onJoinRoom(joinInput.trim().toLowerCase());
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      <div className="pointer-events-auto max-w-md w-full my-auto">
        <div className="rounded-2xl bg-[#0e090c]/92 border-2 border-[#750a18] shadow-[0_24px_60px_rgba(0,0,0,0.85)] p-6 md:p-7">
          {/* Bespoke Inline SVG Dracula Crest + Title Lockup */}
          <div className="flex items-center gap-3.5 mb-5">
            <svg
              width="52"
              height="52"
              viewBox="0 0 64 64"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                d="M32 10c-3 5-9 8-14 6-3 7-10 9-14 7 4 9 11 14 20 13l8 18 8-18c9 1 16-4 20-13-4 2-11 0-14-7-5 2-11-1-14-6Z"
                fill="#d91026"
                stroke="#14090c"
                strokeWidth="2.5"
              />
              <path
                d="M23 22l4 10 5-7 5 7 4-10"
                fill="none"
                stroke="#f5ece8"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <h1 className="font-gothic text-2xl md:text-3xl font-black tracking-wider text-[#f8ecea] text-stroke-dark leading-tight">
                DRÁCULA
                <span className="block text-[#e61229] text-lg md:text-xl mt-0.5">
                  AJEDREZ 3D
                </span>
              </h1>
            </div>
          </div>

          {!twoPlayerStep && (
            <div className="space-y-4">
              {/* Custom Numeric ELO Input (50 - 5000) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="ai-elo-input"
                    className="text-xs uppercase tracking-widest text-[#b89fa3] font-semibold"
                  >
                    ELO del Robot (50 – 5.000)
                  </label>
                  <span className="text-xs font-bold text-[#ff6b7d] tabular-nums">
                    {parsedElo} ELO
                  </span>
                </div>

                <input
                  id="ai-elo-input"
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={MIN_AI_ELO}
                  max={MAX_AI_ELO}
                  value={eloText}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setEloText(raw);
                    if (raw !== '') {
                      onChangeAiElo(clampElo(Number(raw)));
                    }
                  }}
                  onBlur={() => commitElo(eloText)}
                  placeholder="Escribe un ELO entre 50 y 5000"
                  className="w-full rounded-xl bg-[#160e12] border-2 border-[#591722] focus:border-[#e61229] outline-none px-4 py-2.5 font-mono text-xl font-black text-white tabular-nums"
                />

                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[50, 1200, 2600, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setEloText(String(preset));
                        onChangeAiElo(preset);
                      }}
                      className={`py-1.5 rounded-lg text-xs font-bold border tabular-nums cursor-pointer transition-colors ${
                        parsedElo === preset
                          ? 'bg-[#b30d21] border-[#ff4d63] text-white'
                          : 'bg-[#181216] border-[#3d2127] text-[#cbb6ba] hover:border-[#8c1625]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <p className="mt-1.5 text-[11px] text-[#b89fa3]">
                  {getEloTierDescription(parsedElo)}
                </p>
              </div>

              {/* Primary CTAs */}
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  data-start="true"
                  onClick={() => {
                    const finalElo = commitElo(eloText);
                    onStartSinglePlayer(finalElo);
                  }}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl bg-[#d61126] hover:bg-[#ef1830] active:scale-[0.99] text-white font-bold text-base border border-[#ff6b7d]/50 shadow-[0_6px_22px_rgba(214,17,38,0.45)] transition-all cursor-pointer"
                >
                  <User className="w-5 h-5" />
                  <span>1 Jugador</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenTwoPlayer}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl bg-[#181317] hover:bg-[#241b21] active:scale-[0.99] text-[#f5ece8] font-bold text-base border border-[#6e1522] transition-all cursor-pointer"
                >
                  <Users className="w-5 h-5 text-[#e61229]" />
                  <span>2 Jugadores</span>
                </button>
              </div>
            </div>
          )}

          {twoPlayerStep === 'choose' && (
            <div className="space-y-3.5">
              <button
                type="button"
                onClick={onBackToMain}
                className="inline-flex items-center gap-1.5 text-xs text-[#b89fa3] hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver</span>
              </button>

              <div>
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#b89fa3] font-semibold mb-2">
                  <Clock className="w-3.5 h-3.5 text-[#e61229]" />
                  <span>Tiempo por jugador</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ALLOWED_TIME_CONTROLS.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      data-testid={`time-control-${mins}`}
                      onClick={() => onChangeTimeControl(mins)}
                      className={`py-2.5 rounded-xl text-sm font-black border tabular-nums cursor-pointer transition-colors ${
                        timeControlMinutes === mins
                          ? 'bg-[#b30d21] border-[#ff4d63] text-white shadow-[0_4px_14px_rgba(214,17,38,0.35)]'
                          : 'bg-[#181216] border-[#3d2127] text-[#cbb6ba] hover:border-[#8c1625]'
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-sm text-[#dfd1d3] font-medium">
                Elige cómo jugar la partida de 2 jugadores:
              </p>

              <button
                type="button"
                onClick={onCreateRoom}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl bg-[#d61126] hover:bg-[#ef1830] text-white font-bold text-base border border-[#ff6b7d]/50 transition-all cursor-pointer"
              >
                <Crown className="w-5 h-5" />
                <span>Crear partida ({timeControlMinutes} min)</span>
              </button>

              <button
                type="button"
                onClick={onOpenJoinForm}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl bg-[#181317] hover:bg-[#241b21] text-[#f5ece8] font-bold text-base border border-[#6e1522] transition-all cursor-pointer"
              >
                <Users className="w-5 h-5 text-[#e61229]" />
                <span>Me quiero unir a una partida</span>
              </button>
            </div>
          )}

          {(twoPlayerStep === 'creating' || twoPlayerStep === 'waiting') && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={onBackToMain}
                className="inline-flex items-center gap-1.5 text-xs text-[#b89fa3] hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Cancelar sala</span>
              </button>

              {twoPlayerStep === 'creating' || !roomCode ? (
                <div className="flex items-center gap-3 py-4 text-sm text-[#dfd1d3]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#e61229]" />
                  <span>Creando sala en línea...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-[#b89fa3] font-semibold">
                    Comparte este código de 5 letras minúsculas:
                  </p>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-[#160e12] border-2 border-[#d61126] px-4 py-3">
                    <span
                      data-testid="room-code-display"
                      className="font-mono text-3xl font-black tracking-[0.28em] text-[#ff4d63]"
                    >
                      {roomCode}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      aria-label="Copiar código"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2a151b] hover:bg-[#3d1c25] text-xs font-semibold text-white cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2.5 text-sm text-[#d4c2c5]">
                    <div className="flex items-center gap-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-[#e61229] shrink-0" />
                      <span>Esperando al segundo jugador...</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#ff8a98] bg-[#211015] border border-[#591722] px-2.5 py-1 rounded-lg">
                      {timeControlMinutes} min
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {twoPlayerStep === 'joining' && (
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <button
                type="button"
                onClick={onBackToMain}
                className="inline-flex items-center gap-1.5 text-xs text-[#b89fa3] hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver</span>
              </button>

              <div>
                <label
                  htmlFor="room-code-input"
                  className="block text-xs uppercase tracking-widest text-[#b89fa3] font-semibold mb-2"
                >
                  Código de 5 letras minúsculas
                </label>
                <input
                  id="room-code-input"
                  type="text"
                  maxLength={5}
                  autoFocus
                  autoComplete="off"
                  value={joinInput}
                  onChange={(e) => {
                    const cleaned = e.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
                    setJoinInput(cleaned);
                  }}
                  placeholder="ej. dracu"
                  className="w-full rounded-xl bg-[#160e12] border-2 border-[#591722] focus:border-[#e61229] outline-none px-4 py-3 font-mono text-2xl font-bold tracking-[0.25em] text-center text-white placeholder:text-[#5c4348] placeholder:tracking-normal placeholder:text-base"
                />
              </div>

              {errorMessage && (
                <p role="alert" className="text-xs font-medium text-[#ff6b7d] bg-[#2c0b12] border border-[#8c1625] rounded-lg px-3 py-2">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={isConnecting || joinInput.length !== 5}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-[#d61126] hover:bg-[#ef1830] disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold text-base border border-[#ff6b7d]/50 transition-all cursor-pointer"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <span>Entrar a la partida</span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Single Flat Control Hint Line in Bottom Safe Margin */}
      <div className="pointer-events-none text-center">
        <p className="inline-block text-xs md:text-sm tracking-wide text-[#c8b2b6] bg-[#0c080a]/80 px-4 py-1.5 rounded-full border border-[#3d1b22]">
          Arrastra para rotar · Rueda o 2 dedos para zoom · Clic en pieza y casilla para mover
        </p>
      </div>
    </div>
  );
}
