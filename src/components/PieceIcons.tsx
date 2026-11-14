import type { PieceType, TeamColor } from '../chess/types';

export function PieceMiniIcon({
  type,
  color,
  size = 18,
}: {
  type: PieceType;
  color: TeamColor;
  size?: number;
}) {
  const fill = color === 'w' ? '#e61229' : '#1b1821';
  const stroke = color === 'w' ? '#ff7a88' : '#d61126';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="inline-block shrink-0"
    >
      {type === 'p' && (
        <path
          d="M12 4a3.5 3.5 0 0 0-3.5 3.5c0 1.2.6 2.3 1.5 2.9L8 16h8l-2-5.6c.9-.6 1.5-1.7 1.5-2.9A3.5 3.5 0 0 0 12 4Zm-5 14h10v2H7v-2Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.4"
        />
      )}
      {type === 'r' && (
        <path
          d="M6 4h2v2h2V4h4v2h2V4h2v4l-1.5 1.5V16l1.5 2v2H6v-2l1.5-2V9.5L6 8V4Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.4"
        />
      )}
      {type === 'n' && (
        <path
          d="M15 4c-3.5 0-6.5 2.5-7 6l2.5 1-2.5 4h3l1.5-2 1 3H7v4h10v-3c0-3.5 1-6.5-1-9.5L15 4Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.4"
        />
      )}
      {type === 'b' && (
        <path
          d="M12 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm0 4C9.5 8 8 10.5 8 13l1.5 3h5L16 13c0-2.5-1.5-5-4-6.5ZM7 18h10v2H7v-2Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.4"
        />
      )}
      {type === 'q' && (
        <path
          d="M4 7l3.5 4L12 5l4.5 6L20 7l-2 9H6L4 7Zm2 11h12v2H6v-2Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.4"
        />
      )}
      {type === 'k' && (
        <path
          d="M11 2h2v2h2v2h-2v2h4l-1.5 8h-7L7 8h4V6H9V4h2V2ZM7 18h10v2H7v-2Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.4"
        />
      )}
    </svg>
  );
}
