import type { PlayerId, RoomCode, RoomPhase } from "@partymode/shared";
import type WebSocket from "ws";
import type { BluffTriviaEngine } from "../game/bluffTrivia.js";

export interface PlayerSession {
  id: PlayerId;
  nickname: string;
  score: number;
  sessionToken: string;
  connectionState: "connected" | "disconnected_grace" | "removed";
  connection: WebSocket | null;
  disconnectTimer: NodeJS.Timeout | null;
}

export class Room {
  phase: RoomPhase = "lobby";
  hostSessionToken: string | null = null;
  hostConnection: WebSocket | null = null;
  hostConnected = false;
  hostDisconnectTimer: NodeJS.Timeout | null = null;
  players = new Map<PlayerId, PlayerSession>();
  game: BluffTriviaEngine | null = null;
  idleTimer: NodeJS.Timeout | null = null;

  constructor(
    public readonly code: RoomCode,
    public readonly hostToken: string,
    public readonly createdAt = Date.now()
  ) {}

  roster() {
    return [...this.players.values()].map((player) => ({
      id: player.id,
      nickname: player.nickname,
      score: player.score,
      connectionState: player.connectionState
    }));
  }

  activePlayers() {
    return [...this.players.values()].filter((player) => player.connectionState !== "removed");
  }

  connectedPlayers() {
    return [...this.players.values()].filter((player) => player.connectionState === "connected");
  }
}
