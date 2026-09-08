export const PROTOCOL_VERSION = 1;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PLAYER_GRACE_MS = 45_000;
export const HOST_GRACE_MS = 60_000;
export const ROOM_IDLE_MS = 10 * 60_000;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const ROUND_COUNT = 3;

export function isValidRoomCode(value: string): boolean {
  return value.length === 4 && [...value].every((char) => ROOM_CODE_ALPHABET.includes(char));
}

export function isValidNickname(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Za-z0-9 ]{1,16}$/.test(trimmed);
}
