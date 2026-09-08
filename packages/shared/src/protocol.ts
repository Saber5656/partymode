import { z } from "zod";
import { ErrorCodes } from "./errorCodes.js";
import { PROTOCOL_VERSION, isValidNickname, isValidRoomCode } from "./constants.js";

export class ProtocolError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

export type Envelope<T extends string, P> = {
  type: T;
  v: typeof PROTOCOL_VERSION;
  payload: P;
};

const BaseEnvelopeSchema = z.object({
  type: z.string(),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.unknown()
});

const RoomCodeSchema = z.string().refine(isValidRoomCode, "invalid room code");
const NicknameSchema = z.string().transform((value) => value.trim()).refine(isValidNickname);

export const CreateRoomRequestSchema = z.object({});
export const CreateRoomResponseSchema = z.object({
  roomCode: RoomCodeSchema,
  hostToken: z.string().min(16)
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;

export const HeartbeatMessageSchema = z.object({
  type: z.literal("heartbeat"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({})
});
export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;

export const HostHelloMessageSchema = z.object({
  type: z.literal("host_hello"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({ roomCode: RoomCodeSchema, hostToken: z.string().min(16) })
});
export type HostHelloMessage = z.infer<typeof HostHelloMessageSchema>;

export const JoinRoomMessageSchema = z.object({
  type: z.literal("join_room"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({ roomCode: RoomCodeSchema, nickname: NicknameSchema })
});
export type JoinRoomMessage = z.infer<typeof JoinRoomMessageSchema>;

export const ResumeSessionMessageSchema = z.object({
  type: z.literal("resume_session"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({
    roomCode: RoomCodeSchema,
    role: z.enum(["host", "player"]),
    sessionToken: z.string().min(16)
  })
});
export type ResumeSessionMessage = z.infer<typeof ResumeSessionMessageSchema>;

export const StartGameMessageSchema = z.object({
  type: z.literal("start_game"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({})
});
export type StartGameMessage = z.infer<typeof StartGameMessageSchema>;

export const EndRoomMessageSchema = z.object({
  type: z.literal("end_room"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({})
});
export type EndRoomMessage = z.infer<typeof EndRoomMessageSchema>;

export const PlayAgainMessageSchema = z.object({
  type: z.literal("play_again"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({})
});
export type PlayAgainMessage = z.infer<typeof PlayAgainMessageSchema>;

export const NextPhaseMessageSchema = z.object({
  type: z.literal("next_phase"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({})
});
export type NextPhaseMessage = z.infer<typeof NextPhaseMessageSchema>;

export const SubmitInputMessageSchema = z.object({
  type: z.literal("submit_input"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({ phase: z.string(), data: z.unknown() })
});
export type SubmitInputMessage = z.infer<typeof SubmitInputMessageSchema>;

export const ClientToServerMessageSchema = z.discriminatedUnion("type", [
  HeartbeatMessageSchema,
  HostHelloMessageSchema,
  JoinRoomMessageSchema,
  ResumeSessionMessageSchema,
  StartGameMessageSchema,
  EndRoomMessageSchema,
  PlayAgainMessageSchema,
  NextPhaseMessageSchema,
  SubmitInputMessageSchema
]);
export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchema>;

export const RosterPlayerSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  score: z.number(),
  connectionState: z.enum(["connected", "disconnected_grace", "removed"])
});

export const HeartbeatAckMessageSchema = z.object({
  type: z.literal("heartbeat_ack"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({})
});
export type HeartbeatAckMessage = z.infer<typeof HeartbeatAckMessageSchema>;

export const HostReadyMessageSchema = z.object({
  type: z.literal("host_ready"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({
    roomCode: RoomCodeSchema,
    sessionToken: z.string().min(16),
    roster: z.array(RosterPlayerSchema)
  })
});
export type HostReadyMessage = z.infer<typeof HostReadyMessageSchema>;

export const JoinedMessageSchema = z.object({
  type: z.literal("joined"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({
    roomCode: RoomCodeSchema,
    playerId: z.string(),
    sessionToken: z.string().min(16),
    roster: z.array(RosterPlayerSchema)
  })
});
export type JoinedMessage = z.infer<typeof JoinedMessageSchema>;

export const ResumedMessageSchema = z.object({
  type: z.literal("resumed"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({
    roomCode: RoomCodeSchema,
    role: z.enum(["host", "player"]),
    playerId: z.string().optional(),
    sessionToken: z.string().min(16),
    roster: z.array(RosterPlayerSchema)
  })
});
export type ResumedMessage = z.infer<typeof ResumedMessageSchema>;

export const RosterUpdateMessageSchema = z.object({
  type: z.literal("roster_update"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({
    roomCode: RoomCodeSchema,
    roomPhase: z.enum(["lobby", "in_game", "closed"]),
    hostConnected: z.boolean(),
    roster: z.array(RosterPlayerSchema)
  })
});
export type RosterUpdateMessage = z.infer<typeof RosterUpdateMessageSchema>;

export const GameStateMessageSchema = z.object({
  type: z.literal("game_state"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({
    roomCode: RoomCodeSchema,
    roomPhase: z.enum(["lobby", "in_game", "closed"]),
    gamePhase: z.string().nullable(),
    timing: z.object({ phaseEnteredAt: z.number(), timeoutMs: z.number().nullable() }).nullable(),
    paused: z.boolean(),
    hostView: z.unknown().optional(),
    playerView: z.unknown().optional()
  })
});
export type GameStateMessage = z.infer<typeof GameStateMessageSchema>;

export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({ code: z.nativeEnum(ErrorCodes), message: z.string() })
});
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export const RoomClosedMessageSchema = z.object({
  type: z.literal("room_closed"),
  v: z.literal(PROTOCOL_VERSION),
  payload: z.object({ reason: z.string() })
});
export type RoomClosedMessage = z.infer<typeof RoomClosedMessageSchema>;

export const ServerToClientMessageSchema = z.discriminatedUnion("type", [
  HeartbeatAckMessageSchema,
  HostReadyMessageSchema,
  JoinedMessageSchema,
  ResumedMessageSchema,
  RosterUpdateMessageSchema,
  GameStateMessageSchema,
  ErrorMessageSchema,
  RoomClosedMessageSchema
]);
export type ServerToClientMessage = z.infer<typeof ServerToClientMessageSchema>;

// Throws ProtocolError so server transport has one validation failure path.
export function parseClientMessage(raw: unknown): ClientToServerMessage {
  const envelope = BaseEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new ProtocolError("Invalid protocol envelope", envelope.error);
  }
  const parsed = ClientToServerMessageSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProtocolError("Invalid client message", parsed.error);
  }
  return parsed.data;
}

export function makeServerMessage<T extends ServerToClientMessage["type"]>(
  type: T,
  payload: Extract<ServerToClientMessage, { type: T }>["payload"]
): Extract<ServerToClientMessage, { type: T }> {
  return { type, v: PROTOCOL_VERSION, payload } as Extract<ServerToClientMessage, { type: T }>;
}
