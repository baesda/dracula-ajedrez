import { useRef, useState } from 'react';
import { Sun } from 'lucide-react';
import { computeBrightnessFromPointerY } from '../three/brightness';

interface BrightnessControlProps {
  brightness: number;
  onChangeBrightness: (next: number) => void;
}

export function BrightnessControl({
  brightness,
  onChangeBrightness,
}: BrightnessControlProps) {
  const [barOpen, setBarOpen] = useState(true);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingPointerIdRef = useRef<number | null>(null);

  const updateFromClientY = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = computeBrightnessFromPointerY(clientY, rect.top, rect.height);
    onChangeBrightness(next);
  };

  const trackHeight = 100;
  const fillHeight = Math.round(brightness * trackHeight);
  const fillY = trackHeight - fillHeight;
  const thumbCy = Math.max(6, Math.min(trackHeight - 6, fillY));

  return (
    <div
      data-testid="brightness-control"
      className="fixed bottom-4 left-4 z-30 pointer-events-auto flex flex-col items-center gap-2 select-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {barOpen && (
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Brillo de la escena"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(brightness * 100)}
          data-testid="brightness-bar"
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            draggingPointerIdRef.current = e.pointerId;
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // Ignore synthetic pointer events without an active hardware pointer
            }
            updateFromClientY(e.clientY);
          }}
          onPointerMove={(e) => {
            if (draggingPointerIdRef.current !== e.pointerId) return;
            e.preventDefault();
            updateFromClientY(e.clientY);
          }}
          onPointerUp={(e) => {
            if (draggingPointerIdRef.current === e.pointerId) {
              draggingPointerIdRef.current = null;
              try {
                e.currentTarget.releasePointerCapture?.(e.pointerId);
              } catch {
                // Ignore if capture was not held
              }
            }
          }}
          onPointerCancel={(e) => {
            if (draggingPointerIdRef.current === e.pointerId) {
              draggingPointerIdRef.current = null;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
              e.preventDefault();
              onChangeBrightness(Math.min(1, brightness + 0.08));
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
              e.preventDefault();
              onChangeBrightness(Math.max(0, brightness - 0.08));
            }
          }}
          className="w-11 h-32 rounded-full bg-[#0e090c]/92 border-2 border-[#750a18] shadow-[0_12px_30px_rgba(0,0,0,0.85)] py-2.5 flex items-center justify-center touch-none cursor-ns-resize"
        >
          <svg
            viewBox="0 0 24 100"
            className="w-6 h-full overflow-visible pointer-events-none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="dracula-brightness-orange" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#c2410c" />
                <stop offset="55%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#fb923c" />
              </linearGradient>
            </defs>
            <rect
              x="8"
              y="0"
              width="8"
              height={trackHeight}
              rx="4"
              fill="#261318"
            />
            {fillHeight > 0 && (
              <rect
                x="8"
                y={fillY}
                width="8"
                height={fillHeight}
                rx="4"
                fill="url(#dracula-brightness-orange)"
              />
            )}
            <circle
              cx="12"
              cy={thumbCy}
              r="6"
              fill="#fb923c"
              stroke="#fde047"
              strokeWidth="2"
            />
          </svg>
        </div>
      )}

      <button
        type="button"
        data-testid="brightness-button"
        aria-label="Brillo"
        aria-expanded={barOpen}
        onClick={(e) => {
          e.currentTarget.blur();
          setBarOpen((prev) => !prev);
        }}
        className="w-11 h-11 rounded-full bg-[#0e090c]/95 hover:bg-[#231218] border-2 border-[#750a18] shadow-[0_10px_24px_rgba(0,0,0,0.85)] flex items-center justify-center cursor-pointer transition-colors"
      >
        <Sun className="w-5 h-5 text-[#facc15] drop-shadow-[0_0_8px_rgba(250,204,21,0.65)]" />
      </button>
    </div>
  );
}
