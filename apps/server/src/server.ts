import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import {
  ErrorCodes,
  HOST_GRACE_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_GRACE_MS,
  PROTOCOL_VERSION,
  ROOM_IDLE_MS,
  type ClientToServerMessage,
  type ErrorCode,
  type PlayerId,
  type RoomCode,
  makeServerMessage,
  parseClientMessage
} from "@partymode/shared";
import { WebSocket, WebSocketServer } from "ws";
import { BluffTriviaEngine } from "./game/bluffTrivia.js";
import { Room, type PlayerSession } from "./room/room.js";
import { RoomManager } from "./room/roomManager.js";

const ROOM_CLOSED_CODE = 4003;

type ConnectionContext =
  | { role: "unbound" }
  | { role: "host"; roomCode: RoomCode }
  | { role: "player"; roomCode: RoomCode; playerId: PlayerId };

export interface PartymodeServerOptions {
  timers?: "real" | "manual";
}

export function createPartymodeServer(options: PartymodeServerOptions = {}) {
  const timers = options.timers ?? "real";
  const manager = new RoomManager();
  const contexts = new WeakMap<WebSocket, ConnectionContext>();
  const wss = new WebSocketServer({ noServer: true });

  // Node's built-in http module keeps one process/port for API, static assets, and WS upgrades.
  const httpServer = createServer((request, response) => {
    void handleHttp(request, response, manager);
  });

  httpServer.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      contexts.set(ws, { role: "unbound" });
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        sendError(ws, ErrorCodes.invalid_message, "Malformed JSON");
        return;
      }
      if (isProtocolVersionMismatch(raw)) {
        sendError(ws, ErrorCodes.protocol_version_mismatch, "Protocol version mismatch");
        return;
      }
      try {
        handleMessage(ws, parseClientMessage(raw), manager, contexts, timers);
      } catch (error) {
        sendError(ws, ErrorCodes.invalid_message, error instanceof Error ? error.message : "Invalid message");
      }
    });

    ws.on("close", () => {
      handleSocketClose(ws, manager, contexts, timers);
    });
  });

  return {
    roomManager: manager,
    httpServer,
    wss,
    listen(port: number) {
      return new Promise<void>((resolve) => httpServer.listen(port, "0.0.0.0", resolve));
    },
    port() {
      const address = httpServer.address();
      if (!address || typeof address === "string") {
        throw new Error("Server is not listening on a TCP port");
      }
      return address.port;
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close((wssError) => {
          if (wssError) {
            reject(wssError);
            return;
          }
          httpServer.close((httpError) => {
            if (httpError) {
              reject(httpError);
              return;
            }
            resolve();
          });
        });
      });
    }
  };
}

async function handleHttp(request: IncomingMessage, response: ServerResponse, manager: RoomManager) {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  if (method === "GET" && url.pathname === "/healthz") {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (method === "POST" && url.pathname === "/api/rooms") {
    sendJson(response, 201, manager.createRoom());
    return;
  }
  if (method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }
  if (method !== "GET") {
    sendJson(response, 404, { message: "Not found" });
    return;
  }
  serveStatic(url.pathname, response);
}

function handleMessage(
  ws: WebSocket,
  message: ClientToServerMessage,
  manager: RoomManager,
  contexts: WeakMap<WebSocket, ConnectionContext>,
  timers: "real" | "manual"
) {
  const context = contexts.get(ws) ?? { role: "unbound" };
  if (message.type === "heartbeat") {
    send(ws, makeServerMessage("heartbeat_ack", {}));
    return;
  }
  if (message.type === "host_hello") {
    const room = manager.getRoom(message.payload.roomCode);
    if (!room || room.phase === "closed" || room.hostToken !== message.payload.hostToken) {
      sendError(ws, ErrorCodes.room_not_found, "Invalid room or host token");
      ws.close(4001, "invalid host");
      return;
    }
    bindHost(ws, room, manager, contexts);
    return;
  }
  if (message.type === "join_room") {
    const room = manager.getRoom(message.payload.roomCode);
    if (!room || room.phase === "closed") {
      sendError(ws, ErrorCodes.room_not_found, "Room not found");
      return;
    }
    if (room.phase !== "lobby") {
      sendError(ws, ErrorCodes.room_in_progress, "Game already in progress");
      return;
    }
    const normalized = message.payload.nickname.trim();
    if (room.activePlayers().some((player) => player.nickname.toLowerCase() === normalized.toLowerCase())) {
      sendError(ws, ErrorCodes.nickname_taken, "Nickname is already taken");
      return;
    }
    if (room.activePlayers().length >= MAX_PLAYERS) {
      sendError(ws, ErrorCodes.room_full, "Room is full");
      return;
    }
    const player: PlayerSession = {
      id: manager.createPlayerId(),
      nickname: normalized,
      score: 0,
      sessionToken: manager.generateToken(),
      connectionState: "connected",
      connection: ws,
      disconnectTimer: null
    };
    room.players.set(player.id, player);
    contexts.set(ws, { role: "player", roomCode: room.code, playerId: player.id });
    clearIdle(room);
    send(ws, makeServerMessage("joined", { roomCode: room.code, playerId: player.id, sessionToken: player.sessionToken, roster: room.roster() }));
    broadcastRoster(room);
    return;
  }
  if (message.type === "resume_session") {
    const room = manager.getRoom(message.payload.roomCode);
    if (!room || room.phase === "closed") {
      sendError(ws, ErrorCodes.session_expired, "Session expired");
      ws.close(4001, "session expired");
      return;
    }
    if (message.payload.role === "host") {
      if (room.hostSessionToken !== message.payload.sessionToken) {
        sendError(ws, ErrorCodes.session_expired, "Session expired");
        ws.close(4001, "session expired");
        return;
      }
      bindHost(ws, room, manager, contexts);
      send(ws, makeServerMessage("resumed", { roomCode: room.code, role: "host", sessionToken: room.hostSessionToken, roster: room.roster() }));
      broadcastGameState(room);
      return;
    }
    const player = [...room.players.values()].find((candidate) => candidate.sessionToken === message.payload.sessionToken);
    if (!player || player.connectionState === "removed") {
      sendError(ws, ErrorCodes.session_expired, "Session expired");
      ws.close(4001, "session expired");
      return;
    }
    if (player.connection && player.connection !== ws) {
      player.connection.close(4002, "session superseded");
    }
    player.connection = ws;
    player.connectionState = "connected";
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
    contexts.set(ws, { role: "player", roomCode: room.code, playerId: player.id });
    updateEngineRoster(room);
    send(ws, makeServerMessage("resumed", { roomCode: room.code, role: "player", playerId: player.id, sessionToken: player.sessionToken, roster: room.roster() }));
    broadcastRoster(room);
    broadcastGameState(room);
    return;
  }
  if (context.role === "unbound") {
    sendError(ws, ErrorCodes.unauthorized, "Handshake required");
    return;
  }
  const room = manager.getRoom(context.roomCode);
  if (!room || room.phase === "closed") {
    sendError(ws, ErrorCodes.room_closed, "Room is closed");
    return;
  }
  if (message.type === "end_room") {
    if (!isHost(ws, context)) {
      return;
    }
    closeRoom(room, manager, "host ended room");
    return;
  }
  if (message.type === "start_game") {
    if (!isHost(ws, context)) {
      return;
    }
    const activePlayers = room.activePlayers();
    if (room.phase !== "lobby") {
      sendError(ws, ErrorCodes.wrong_phase, "Room is not in lobby");
      return;
    }
    if (activePlayers.length < MIN_PLAYERS) {
      sendError(ws, ErrorCodes.not_enough_players, "Need at least three active players");
      return;
    }
    if (activePlayers.length > MAX_PLAYERS) {
      sendError(ws, ErrorCodes.too_many_players, "Too many active players");
      return;
    }
    room.phase = "in_game";
    room.game = new BluffTriviaEngine(activePlayers.map((player) => ({ id: player.id, nickname: player.nickname })));
    startPhaseTimer(room, timers);
    broadcastRoster(room);
    broadcastGameState(room);
    return;
  }
  if (message.type === "submit_input") {
    if (context.role !== "player") {
      sendError(ws, ErrorCodes.player_required, "Player session required");
      return;
    }
    if (room.phase !== "in_game" || !room.game) {
      sendError(ws, ErrorCodes.game_not_started, "Game not started");
      return;
    }
    if (message.payload.phase !== room.game.currentPhase) {
      sendError(ws, ErrorCodes.wrong_phase, "Wrong phase");
      return;
    }
    try {
      room.game.submit(context.playerId, message.payload.data);
      syncScores(room);
      startPhaseTimer(room, timers);
      broadcastGameState(room);
    } catch (error) {
      sendError(ws, ErrorCodes.invalid_input, error instanceof Error ? error.message : "Invalid input");
    }
    return;
  }
  if (message.type === "next_phase") {
    if (!isHost(ws, context)) {
      return;
    }
    if (room.game) {
      room.game.advance();
      syncScores(room);
      startPhaseTimer(room, timers);
      broadcastGameState(room);
    }
    return;
  }
  if (message.type === "play_again") {
    if (!isHost(ws, context)) {
      return;
    }
    if (room.game?.isOver) {
      room.phase = "lobby";
      room.game = null;
      for (const player of room.players.values()) {
        player.score = 0;
      }
      broadcastRoster(room);
      broadcastGameState(room);
    } else {
      sendError(ws, ErrorCodes.wrong_phase, "Game is not at final results");
    }
  }
}

function bindHost(
  ws: WebSocket,
  room: Room,
  manager: RoomManager,
  contexts: WeakMap<WebSocket, ConnectionContext>
) {
  if (room.hostConnection && room.hostConnection !== ws) {
    room.hostConnection.close(4002, "session superseded");
  }
  room.hostSessionToken ??= manager.generateToken();
  room.hostConnection = ws;
  room.hostConnected = true;
  if (room.hostDisconnectTimer) {
    clearTimeout(room.hostDisconnectTimer);
    room.hostDisconnectTimer = null;
  }
  contexts.set(ws, { role: "host", roomCode: room.code });
  clearIdle(room);
  send(ws, makeServerMessage("host_ready", { roomCode: room.code, sessionToken: room.hostSessionToken, roster: room.roster() }));
  broadcastRoster(room);
}

function handleSocketClose(
  ws: WebSocket,
  manager: RoomManager,
  contexts: WeakMap<WebSocket, ConnectionContext>,
  timers: "real" | "manual"
) {
  const context = contexts.get(ws);
  if (!context || context.role === "unbound") {
    return;
  }
  const room = manager.getRoom(context.roomCode);
  if (!room || room.phase === "closed") {
    return;
  }
  if (context.role === "host" && room.hostConnection === ws) {
    room.hostConnected = false;
    room.hostConnection = null;
    if (timers === "real") {
      room.hostDisconnectTimer = setTimeout(() => closeRoom(room, manager, "host disconnected"), HOST_GRACE_MS);
      startIdle(room, manager);
    }
    broadcastRoster(room);
    broadcastGameState(room);
    return;
  }
  if (context.role === "player") {
    const player = room.players.get(context.playerId);
    if (!player || player.connection !== ws) {
      return;
    }
    player.connection = null;
    player.connectionState = "disconnected_grace";
    if (timers === "real") {
      player.disconnectTimer = setTimeout(() => {
        player.connectionState = "removed";
        updateEngineRoster(room);
        broadcastRoster(room);
        broadcastGameState(room);
      }, PLAYER_GRACE_MS);
    }
    updateEngineRoster(room);
    broadcastRoster(room);
    broadcastGameState(room);
  }
}

function closeRoom(room: Room, manager: RoomManager, reason: string) {
  room.phase = "closed";
  for (const player of room.players.values()) {
    if (player.connection) {
      send(player.connection, makeServerMessage("room_closed", { reason }));
      player.connection.close(ROOM_CLOSED_CODE, reason);
    }
  }
  if (room.hostConnection) {
    send(room.hostConnection, makeServerMessage("room_closed", { reason }));
    room.hostConnection.close(ROOM_CLOSED_CODE, reason);
  }
  manager.closeRoom(room.code);
}

function broadcastRoster(room: Room) {
  const message = makeServerMessage("roster_update", {
    roomCode: room.code,
    roomPhase: room.phase,
    hostConnected: room.hostConnected,
    roster: room.roster()
  });
  broadcast(room, message);
}

function broadcastGameState(room: Room) {
  const timing = room.game?.timing ?? null;
  const base = {
    roomCode: room.code,
    roomPhase: room.phase,
    gamePhase: room.game?.currentPhase ?? null,
    timing,
    paused: room.phase === "in_game" && room.activePlayers().length < MIN_PLAYERS
  };
  if (room.hostConnection?.readyState === WebSocket.OPEN) {
    send(room.hostConnection, makeServerMessage("game_state", { ...base, hostView: room.game?.getHostView() }));
  }
  for (const player of room.players.values()) {
    if (player.connection?.readyState === WebSocket.OPEN) {
      send(
        player.connection,
        makeServerMessage("game_state", {
          ...base,
          playerView: room.game?.getPlayerView(player.id)
        })
      );
    }
  }
}

function broadcast(room: Room, message: unknown) {
  if (room.hostConnection?.readyState === WebSocket.OPEN) {
    send(room.hostConnection, message);
  }
  for (const player of room.players.values()) {
    if (player.connection?.readyState === WebSocket.OPEN) {
      send(player.connection, message);
    }
  }
}

function send(ws: WebSocket, message: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, code: ErrorCode, message: string) {
  send(ws, makeServerMessage("error", { code, message }));
}

function isHost(ws: WebSocket, context: ConnectionContext): context is { role: "host"; roomCode: RoomCode } {
  if (context.role !== "host") {
    sendError(ws, ErrorCodes.host_required, "Host session required");
    return false;
  }
  return true;
}

function syncScores(room: Room) {
  if (!room.game) {
    return;
  }
  const scores = room.game.computeFinalScores();
  for (const score of scores) {
    const player = room.players.get(score.playerId);
    if (player) {
      player.score = score.score;
    }
  }
}

function updateEngineRoster(room: Room) {
  if (room.game) {
    room.game.updateRequiredPlayers(room.activePlayers().map((player) => player.id));
    syncScores(room);
  }
}

function startPhaseTimer(room: Room, timers: "real" | "manual") {
  if (timers === "manual" || !room.game) {
    return;
  }
  const timeout = room.game.timing.timeoutMs;
  if (timeout === null) {
    return;
  }
  setTimeout(() => {
    if (room.phase === "in_game" && room.game && room.activePlayers().length >= MIN_PLAYERS) {
      room.game.advance();
      syncScores(room);
      startPhaseTimer(room, timers);
      broadcastGameState(room);
    }
  }, timeout);
}

function startIdle(room: Room, manager: RoomManager) {
  clearIdle(room);
  room.idleTimer = setTimeout(() => {
    if (!room.hostConnected && room.connectedPlayers().length < 1) {
      closeRoom(room, manager, "room idle timeout");
    }
  }, ROOM_IDLE_MS);
}

function clearIdle(room: Room) {
  if (room.idleTimer) {
    clearTimeout(room.idleTimer);
    room.idleTimer = null;
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", ...corsHeaders() });
  response.end(JSON.stringify(body));
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function isProtocolVersionMismatch(raw: unknown): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "v" in raw &&
    (raw as { v: unknown }).v !== PROTOCOL_VERSION
  );
}

function serveStatic(pathname: string, response: ServerResponse) {
  const root = process.cwd();
  const hostDist = join(root, "apps/host/dist");
  const playerDist = join(root, "apps/player/dist");
  const isPlayerPath = pathname === "/join" || pathname.startsWith("/join/");
  const distRoot = isPlayerPath ? playerDist : hostDist;
  const relativePath = isPlayerPath ? pathname.replace(/^\/join\/?/, "") : pathname.replace(/^\//, "");
  const normalized = normalize(relativePath || "index.html");
  const requested = join(distRoot, normalized);
  const filePath =
    existsSync(requested) && statSync(requested).isFile() ? requested : join(distRoot, "index.html");
  if (!filePath.startsWith(distRoot) || !existsSync(filePath)) {
    sendJson(response, 404, { message: "Not found" });
    return;
  }
  response.writeHead(200, { "content-type": contentType(filePath) });
  createReadStream(filePath).pipe(response);
}

function contentType(filePath: string) {
  const ext = extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

export type PartymodeServer = ReturnType<typeof createPartymodeServer>;
