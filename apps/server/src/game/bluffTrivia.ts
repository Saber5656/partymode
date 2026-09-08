import { z } from "zod";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUND_COUNT,
  type AnswerOption,
  type GamePhase,
  type LeaderboardEntry,
  type PlayerId,
  type ScoreDelta,
  type Timing
} from "@partymode/shared";
import { QUESTIONS, type Question } from "./questions.js";

const NO_ANSWER_SENTINEL = "-- no answer --";
const PHASE_TIMEOUTS: Record<GamePhase, number | null> = {
  round_intro: 3_000,
  prompt: 60_000,
  vote: 45_000,
  reveal: 8_000,
  final_results: null
};

const BluffInputSchema = z.object({
  bluff: z.string().trim().min(1).max(80)
});

const VoteInputSchema = z.object({
  answerId: z.string().min(1)
});

interface RoundData {
  question: Question;
  bluffs: Map<PlayerId, string>;
  votes: Map<PlayerId, string>;
  answers: AnswerOption[];
  scoreDeltas: Map<PlayerId, number>;
}

export interface BluffTriviaView {
  phase: GamePhase;
  round: number;
  roundCount: number;
  category?: string;
  question?: string;
  answers?: AnswerOption[];
  scoreDeltas: ScoreDelta[];
  leaderboard: LeaderboardEntry[];
  ownScoreDelta?: number;
}

export class BluffTriviaEngine {
  readonly minPlayers = MIN_PLAYERS;
  readonly maxPlayers = MAX_PLAYERS;
  private phase: GamePhase = "round_intro";
  private phaseEnteredAt = Date.now();
  private readonly players: Array<{ id: PlayerId; nickname: string }>;
  private requiredPlayerIds: Set<PlayerId>;
  private roundIndex = 0;
  private readonly rounds: RoundData[];
  private scores = new Map<PlayerId, number>();

  constructor(players: Array<{ id: PlayerId; nickname: string }>) {
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      throw new Error(`Bluff trivia requires ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
    }
    this.players = players;
    this.requiredPlayerIds = new Set(players.map((player) => player.id));
    for (const player of players) {
      this.scores.set(player.id, 0);
    }
    this.rounds = QUESTIONS.slice(0, ROUND_COUNT).map((question) => ({
      question,
      bluffs: new Map(),
      votes: new Map(),
      answers: [],
      scoreDeltas: new Map()
    }));
  }

  get currentPhase(): GamePhase {
    return this.phase;
  }

  get timing(): Timing {
    return { phaseEnteredAt: this.phaseEnteredAt, timeoutMs: PHASE_TIMEOUTS[this.phase] };
  }

  get isOver(): boolean {
    return this.phase === "final_results";
  }

  submit(playerId: PlayerId, input: unknown): void {
    if (!this.requiredPlayerIds.has(playerId)) {
      throw new Error("Player is not active for this phase");
    }
    if (this.phase === "prompt") {
      const parsed = BluffInputSchema.parse(input);
      if (parsed.bluff.toLowerCase() === this.currentRound.question.correctAnswer.toLowerCase()) {
        throw new Error("Bluff cannot match the correct answer");
      }
      if (parsed.bluff.toLowerCase() === NO_ANSWER_SENTINEL) {
        throw new Error("Reserved no-answer sentinel cannot be submitted");
      }
      this.currentRound.bluffs.set(playerId, parsed.bluff);
      if (this.hasAllPromptInput()) {
        this.advance();
      }
      return;
    }
    if (this.phase === "vote") {
      const parsed = VoteInputSchema.parse(input);
      const answer = this.currentRound.answers.find((option) => option.answerId === parsed.answerId);
      if (!answer) {
        throw new Error("Unknown answer");
      }
      if (answer.authorPlayerId === playerId) {
        throw new Error("Cannot vote for own bluff");
      }
      this.currentRound.votes.set(playerId, parsed.answerId);
      if (this.hasAllVotes()) {
        this.advance();
      }
      return;
    }
    throw new Error("Wrong phase");
  }

  advance(): void {
    if (this.phase === "round_intro") {
      this.enterPhase("prompt");
      return;
    }
    if (this.phase === "prompt") {
      for (const playerId of this.requiredPlayerIds) {
        if (!this.currentRound.bluffs.has(playerId)) {
          this.currentRound.bluffs.set(playerId, NO_ANSWER_SENTINEL);
        }
      }
      this.currentRound.answers = this.buildAnswers();
      this.enterPhase("vote");
      return;
    }
    if (this.phase === "vote") {
      this.computeRoundScores();
      this.enterPhase("reveal");
      return;
    }
    if (this.phase === "reveal") {
      if (this.roundIndex + 1 >= ROUND_COUNT) {
        this.enterPhase("final_results");
      } else {
        this.roundIndex += 1;
        this.enterPhase("round_intro");
      }
    }
  }

  updateRequiredPlayers(activePlayerIds: PlayerId[]): void {
    this.requiredPlayerIds = new Set(activePlayerIds);
    if (this.phase === "prompt" && this.hasAllPromptInput()) {
      this.advance();
    }
    if (this.phase === "vote" && this.hasAllVotes()) {
      this.advance();
    }
  }

  getHostView(): BluffTriviaView {
    return this.projectView();
  }

  getPlayerView(playerId: PlayerId): BluffTriviaView {
    return this.projectView(playerId);
  }

  computeFinalScores(): Array<{ playerId: PlayerId; score: number }> {
    return [...this.scores.entries()].map(([playerId, score]) => ({ playerId, score }));
  }

  advancePhaseForTest(phase: GamePhase): void {
    this.phase = phase;
    if (phase === "vote" && this.currentRound.answers.length === 0) {
      this.currentRound.answers = this.buildAnswers();
    }
  }

  private get currentRound(): RoundData {
    return this.rounds[this.roundIndex]!;
  }

  private enterPhase(phase: GamePhase): void {
    this.phase = phase;
    this.phaseEnteredAt = Date.now();
  }

  private hasAllPromptInput(): boolean {
    return [...this.requiredPlayerIds].every((playerId) => this.currentRound.bluffs.has(playerId));
  }

  private hasAllVotes(): boolean {
    return [...this.requiredPlayerIds].every((playerId) => this.currentRound.votes.has(playerId));
  }

  private buildAnswers(): AnswerOption[] {
    const answers: AnswerOption[] = [
      {
        answerId: `${this.currentRound.question.id}:correct`,
        text: this.currentRound.question.correctAnswer,
        authorPlayerId: null,
        isCorrect: true
      }
    ];
    for (const player of this.players) {
      const text = this.currentRound.bluffs.get(player.id) ?? NO_ANSWER_SENTINEL;
      answers.push({
        answerId: `${this.currentRound.question.id}:${player.id}`,
        text,
        authorPlayerId: player.id,
        authorNickname: player.nickname,
        isCorrect: false
      });
    }
    return answers.sort((a, b) => a.answerId.localeCompare(b.answerId));
  }

  private computeRoundScores(): void {
    const deltas = new Map<PlayerId, number>();
    for (const player of this.players) {
      deltas.set(player.id, 0);
    }
    for (const [voterId, answerId] of this.currentRound.votes) {
      const answer = this.currentRound.answers.find((option) => option.answerId === answerId);
      if (!answer) {
        continue;
      }
      if (answer.isCorrect) {
        deltas.set(voterId, (deltas.get(voterId) ?? 0) + 1000);
      } else if (answer.authorPlayerId && answer.authorPlayerId !== voterId) {
        deltas.set(answer.authorPlayerId, (deltas.get(answer.authorPlayerId) ?? 0) + 500);
      }
    }
    this.currentRound.scoreDeltas = deltas;
    for (const [playerId, delta] of deltas) {
      this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + delta);
    }
  }

  private projectView(playerId?: PlayerId): BluffTriviaView {
    const showAnswers = this.phase === "vote" || this.phase === "reveal";
    const reveal = this.phase === "reveal" || this.phase === "final_results";
    const scoreDeltas = reveal ? this.scoreDeltas() : [];
    const ownScoreDelta = playerId ? scoreDeltas.find((delta) => delta.playerId === playerId)?.delta : undefined;
    return {
      phase: this.phase,
      round: Math.min(this.roundIndex + 1, ROUND_COUNT),
      roundCount: ROUND_COUNT,
      category: this.currentRound.question.category,
      question: this.currentRound.question.question,
      answers: showAnswers
        ? this.currentRound.answers.map((answer) => ({
            ...answer,
            isCorrect: reveal ? answer.isCorrect : undefined,
            authorNickname: reveal ? answer.authorNickname : undefined,
            isOwn: answer.authorPlayerId === playerId
          }))
        : undefined,
      scoreDeltas,
      leaderboard: this.leaderboard(),
      ownScoreDelta
    };
  }

  private scoreDeltas(): ScoreDelta[] {
    return this.players.map((player) => ({
      playerId: player.id,
      nickname: player.nickname,
      delta: this.currentRound.scoreDeltas.get(player.id) ?? 0,
      total: this.scores.get(player.id) ?? 0
    }));
  }

  private leaderboard(): LeaderboardEntry[] {
    const sorted = this.players
      .map((player) => ({ playerId: player.id, nickname: player.nickname, score: this.scores.get(player.id) ?? 0 }))
      .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
    return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
  }
}
