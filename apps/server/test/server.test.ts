import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";
import { PROTOCOL_VERSION } from "@partymode/shared";
import { createPartymodeServer } from "../src/server.ts";

function createInbox(ws: WebSocket) {
  const messages: any[] = [];
  const waiters: Array<() => void> = [];
  ws.on("message", (data) => {
    messages.push(JSON.parse(data.toString()));
    waiters.splice(0).forEach((resolve) => resolve());
  });
  return {
    async waitFor(label: string, predicate: (message: any) => boolean): Promise<any> {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const index = messages.findIndex(predicate);
        if (index >= 0) {
          return messages.splice(index, 1)[0];
        }
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`Timed out waiting for websocket ${label}`)), Math.max(1, deadline - Date.now()));
          waiters.push(() => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      throw new Error(`Timed out waiting for websocket ${label}`);
    }
  };
}

function send(ws: WebSocket, type: string, payload: unknown = {}) {
  ws.send(JSON.stringify({ type, v: PROTOCOL_VERSION, payload }));
}

test("server creates rooms and replies to websocket heartbeat", async () => {
  const app = createPartymodeServer({ timers: "manual" });
  await app.listen(0);
  try {
    const port = app.port();
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const created = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: "POST" });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.match(body.roomCode, /^[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(typeof body.hostToken, "string");

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = createInbox(ws);
    await new Promise((resolve) => ws.once("open", resolve));
    send(ws, "heartbeat");
    assert.equal((await inbox.waitFor("heartbeat_ack", (message) => message.type === "heartbeat_ack")).type, "heartbeat_ack");
    ws.close();
  } finally {
    await app.close();
  }
});

test("three players can complete a game loop over websocket", async () => {
  const app = createPartymodeServer({ timers: "manual" });
  await app.listen(0);
  try {
    const port = app.port();
    const room = await (await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: "POST" })).json();
    const host = new WebSocket(`ws://127.0.0.1:${port}`);
    const hostInbox = createInbox(host);
    await new Promise((resolve) => host.once("open", resolve));
    send(host, "host_hello", room);
    assert.equal((await hostInbox.waitFor("host_ready", (message) => message.type === "host_ready")).type, "host_ready");

    const players = await Promise.all(
      ["Ada", "Ben", "Cal"].map(async (nickname) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const inbox = createInbox(ws);
        await new Promise((resolve) => ws.once("open", resolve));
        send(ws, "join_room", { roomCode: room.roomCode, nickname });
        const joined = await inbox.waitFor(`joined:${nickname}`, (message) => message.type === "joined");
        assert.equal(joined.type, "joined");
        return { ws, inbox, joined };
      })
    );

    send(host, "start_game");
    await delay(20);
    assert.equal(app.roomManager.getRoom(room.roomCode)?.game?.currentPhase, "round_intro");
    const promptWaits = players.map(({ inbox }) =>
      inbox.waitFor("prompt game_state", (message) => message.type === "game_state" && message.payload.gamePhase === "prompt")
    );
    send(host, "next_phase");
    await delay(20);
    assert.equal(app.roomManager.getRoom(room.roomCode)?.game?.currentPhase, "prompt");
    await Promise.all(promptWaits);
    const voteWaits = players.map(({ inbox }) =>
      inbox.waitFor("vote game_state", (message) => message.type === "game_state" && message.payload.gamePhase === "vote")
    );
    for (const [index, player] of players.entries()) {
      send(player.ws, "submit_input", { phase: "prompt", data: { bluff: `Bluff ${index}` } });
    }
    await delay(20);
    assert.equal(app.roomManager.getRoom(room.roomCode)?.game?.currentPhase, "vote");
    const voteMessages = await Promise.all(voteWaits);
    const answerIds = voteMessages.map((message) => {
      const answer = message.payload.playerView.answers.find((candidate: any) => !candidate.isOwn);
      assert.ok(answer);
      return answer.answerId;
    });
    const revealWait = hostInbox.waitFor(
      "reveal game_state",
      (message) => message.type === "game_state" && message.payload.gamePhase === "reveal"
    );
    for (const [index, player] of players.entries()) {
      send(player.ws, "submit_input", { phase: "vote", data: { answerId: answerIds[index] } });
    }
    await delay(20);
    assert.equal(app.roomManager.getRoom(room.roomCode)?.game?.currentPhase, "reveal");

    const hostMessage = await revealWait;
    assert.equal(hostMessage.payload.hostView.phase, "reveal");
    players.forEach(({ ws }) => ws.close());
    host.close();
  } finally {
    await app.close();
  }
});
