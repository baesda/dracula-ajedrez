import { chooseAiMove } from './ai';
import type { PieceType } from './types';

export interface AiWorkerRequest {
  id: number;
  fen: string;
  elo: number;
}

export interface AiWorkerResponse {
  id: number;
  move: { from: string; to: string; promotion?: PieceType } | null;
}

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const { id, fen, elo } = event.data;
  const move = chooseAiMove(fen, elo);
  const response: AiWorkerResponse = { id, move };
  self.postMessage(response);
};
