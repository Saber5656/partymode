import type { PlayerId, Timing } from "./domain.js";

export interface GameModule<TState, THostView, TPlayerView, TPlayerInput> {
  id: string;
  minPlayers: number;
  maxPlayers: number;
  createInitialState(players: Array<{ id: PlayerId; nickname: string }>): TState;
  applyPlayerInput(state: TState, playerId: PlayerId, input: TPlayerInput): TState;
  advancePhase(state: TState): TState;
  updateRequiredPlayers(state: TState, activePlayerIds: PlayerId[]): TState;
  projectHostView(state: TState, roster: Array<{ id: PlayerId; nickname: string }>): THostView;
  projectPlayerView(
    state: TState,
    playerId: PlayerId,
    roster: Array<{ id: PlayerId; nickname: string }>
  ): TPlayerView;
  getInputSchema(state: TState, playerId: PlayerId, phase: string): unknown;
  getTiming(state: TState): Timing;
  isGameOver(state: TState): boolean;
  computeFinalScores(state: TState): Array<{ playerId: PlayerId; score: number }>;
}
