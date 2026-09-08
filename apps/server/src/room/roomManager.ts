import { randomBytes, randomUUID } from "node:crypto";
import { ROOM_CODE_ALPHABET, type PlayerId, type RoomCode } from "@partymode/shared";
import { Room } from "./room.js";

export class RoomManager {
  private rooms = new Map<RoomCode, Room>();

  createRoom(): { roomCode: RoomCode; hostToken: string } {
    const roomCode = this.generateRoomCode();
    const hostToken = this.generateToken();
    this.rooms.set(roomCode, new Room(roomCode, hostToken));
    return { roomCode, hostToken };
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode as RoomCode);
  }

  closeRoom(roomCode: RoomCode): void {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.phase = "closed";
      this.rooms.delete(roomCode);
    }
  }

  createPlayerId(): PlayerId {
    return randomUUID() as PlayerId;
  }

  generateToken(): string {
    return randomBytes(24).toString("base64url");
  }

  private generateRoomCode(): RoomCode {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      let code = "";
      for (let index = 0; index < 4; index += 1) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code as RoomCode)) {
        return code as RoomCode;
      }
    }
    throw new Error("Unable to allocate room code after 10 attempts");
  }
}
