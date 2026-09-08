export const ErrorCodes = {
  room_not_found: "room_not_found",
  room_in_progress: "room_in_progress",
  nickname_taken: "nickname_taken",
  nickname_invalid: "nickname_invalid",
  room_full: "room_full",
  not_enough_players: "not_enough_players",
  too_many_players: "too_many_players",
  session_expired: "session_expired",
  wrong_phase: "wrong_phase",
  invalid_message: "invalid_message",
  protocol_version_mismatch: "protocol_version_mismatch",
  unauthorized: "unauthorized",
  host_required: "host_required",
  player_required: "player_required",
  invalid_input: "invalid_input",
  game_not_started: "game_not_started",
  room_closed: "room_closed"
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
