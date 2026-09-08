import assert from "node:assert/strict";
import WebSocket from "ws";

const baseUrl = process.env.PARTYMODE_URL || "http://127.0.0.1:8787";
const wsUrl = baseUrl.replace(/^http/, "ws");
const v = 1;

function inbox(ws) {
  const messages = [];
  const waiters = [];
  ws.on("message", (data) => {
    messages.push(JSON.parse(data.toString()));
    waiters.splice(0).forEach((resolve) => resolve());
  });
  return {
    async waitFor(label, predicate) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const index = messages.findIndex(predicate);
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), Math.max(1, deadline - Date.now()));
          waiters.push(() => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      throw new Error(`Timed out waiting for ${label}`);
    }
  };
}

function connect() {
  const ws = new WebSocket(wsUrl);
  const box = inbox(ws);
  return new Promise((resolve) => ws.once("open", () => resolve({ ws, box })));
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify({ type, v, payload }));
}

async function main() {
  const created = await fetch(`${baseUrl}/api/rooms`, { method: "POST" });
  assert.equal(created.status, 201);
  const room = await created.json();

  const host = await connect();
  send(host.ws, "host_hello", room);
  const hostReady = await host.box.waitFor("host_ready", (message) => message.type === "host_ready");
  assert.equal(hostReady.payload.roomCode, room.roomCode);

  const players = [];
  for (const nickname of ["Ada", "Ben", "Cal"]) {
    const player = await connect();
    send(player.ws, "join_room", { roomCode: room.roomCode, nickname });
    const joined = await player.box.waitFor("joined", (message) => message.type === "joined");
    players.push({ ...player, joined, nickname });
  }

  send(host.ws, "start_game");
  for (let round = 1; round <= 3; round += 1) {
    send(host.ws, "next_phase");
    await Promise.all(players.map((player) => player.box.waitFor("prompt", (message) => message.type === "game_state" && message.payload.gamePhase === "prompt")));
    const voteWaits = players.map((player) => player.box.waitFor("vote", (message) => message.type === "game_state" && message.payload.gamePhase === "vote"));
    players.forEach((player, index) => send(player.ws, "submit_input", { phase: "prompt", data: { bluff: `round ${round} bluff ${index}` } }));
    const voteViews = await Promise.all(voteWaits);
    const revealWait = host.box.waitFor("reveal", (message) => message.type === "game_state" && message.payload.gamePhase === "reveal");
    voteViews.forEach((message, index) => {
      const choice = message.payload.playerView.answers.find((answer) => !answer.isOwn);
      send(players[index].ws, "submit_input", { phase: "vote", data: { answerId: choice.answerId } });
    });
    await revealWait;
    send(host.ws, "next_phase");
  }

  const final = await host.box.waitFor("final_results", (message) => message.type === "game_state" && message.payload.gamePhase === "final_results");
  assert.equal(final.payload.hostView.phase, "final_results");
  console.log(`smoke passed for room ${room.roomCode}`);
  players.forEach((player) => player.ws.close());
  host.ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
