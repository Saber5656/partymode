export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type PlayerId = Brand<string, "PlayerId">;
export type RoomCode = Brand<string, "RoomCode">;

export type ConnectionState = "connected" | "disconnected_grace" | "removed";
export type RoomPhase = "lobby" | "in_game" | "closed";
export type GamePhase = "round_intro" | "prompt" | "vote" | "reveal" | "final_results";

export interface Player {
  id: PlayerId;
  nickname: string;
  score: number;
  connectionState: ConnectionState;
}

export interface RosterPlayer {
  id: PlayerId;
  nickname: string;
  score: number;
  connectionState: ConnectionState;
}

export interface Timing {
  phaseEnteredAt: number;
  timeoutMs: number | null;
}

export interface AnswerOption {
  answerId: string;
  text: string;
  authorPlayerId: PlayerId | null;
  authorNickname?: string;
  isOwn?: boolean;
  isCorrect?: boolean;
}

export interface ScoreDelta {
  playerId: PlayerId;
  nickname: string;
  delta: number;
  total: number;
}

export interface LeaderboardEntry {
  playerId: PlayerId;
  nickname: string;
  score: number;
  rank: number;
}
