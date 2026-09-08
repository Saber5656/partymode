import assert from "node:assert/strict";
import test from "node:test";
import {
  ErrorCodes,
  ProtocolError,
  isValidNickname,
  isValidRoomCode,
  parseClientMessage
} from "../src/index.ts";

test("room code validation follows the shared alphabet", () => {
  assert.equal(isValidRoomCode("ABCD"), true);
  assert.equal(isValidRoomCode("A0CD"), false);
  assert.equal(isValidRoomCode("AOCD"), false);
  assert.equal(isValidRoomCode("A1CD"), false);
  assert.equal(isValidRoomCode("AICD"), false);
  assert.equal(isValidRoomCode("ABC"), false);
});

test("nickname validation trims and enforces allowed characters", () => {
  assert.equal(isValidNickname("Ada 123"), true);
  assert.equal(isValidNickname("  Ada  "), true);
  assert.equal(isValidNickname(""), false);
  assert.equal(isValidNickname("abcdefghijklmnopq"), false);
  assert.equal(isValidNickname("Ada!"), false);
});

test("parseClientMessage discriminates valid messages", () => {
  const message = parseClientMessage({
    type: "join_room",
    v: 1,
    payload: { roomCode: "ABCD", nickname: "Ada" }
  });
  assert.equal(message.type, "join_room");
  assert.equal(message.payload.nickname, "Ada");
});

test("parseClientMessage throws ProtocolError for malformed messages", () => {
  assert.throws(
    () => parseClientMessage({ type: "join_room", v: 1, payload: { roomCode: "ABCD", nickname: "" } }),
    ProtocolError
  );
});

test("shared error code literals are exported", () => {
  assert.equal(ErrorCodes.invalid_message, "invalid_message");
  assert.equal(ErrorCodes.protocol_version_mismatch, "protocol_version_mismatch");
});
