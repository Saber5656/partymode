import "./styles.css";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PROTOCOL_VERSION, type RosterPlayer } from "@partymode/shared";

type HostView = {
  phase: string;
  round: number;
  roundCount: number;
  category?: string;
  question?: string;
  answers?: Array<{ answerId: string; text: string; authorNickname?: string; isCorrect?: boolean }>;
  scoreDeltas: Array<{ nickname: string; delta: number; total: number }>;
  leaderboard: Array<{ nickname: string; score: number; rank: number }>;
};

type GameState = {
  roomPhase: "lobby" | "in_game" | "closed";
  gamePhase: string | null;
  timing: { phaseEnteredAt: number; timeoutMs: number | null } | null;
  paused: boolean;
  hostView?: HostView;
};

const storageKey = "partymode.hostSession";

function apiBase() {
  return import.meta.env.VITE_SERVER_URL || window.location.origin;
}

function wsUrl() {
  const base = new URL(apiBase());
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return base.toString();
}

function App() {
  const [roomCode, setRoomCode] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [qr, setQr] = useState("");
  const [status, setStatus] = useState("Starting host display");
  const wsRef = useRef<WebSocket | null>(null);
  const intentionalClose = useRef(false);

  useEffect(() => {
    void boot();
    return () => {
      intentionalClose.current = true;
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!roomCode) return;
    const joinUrl = `${window.location.origin}/join?code=${roomCode}`;
    void QRCode.toDataURL(joinUrl, { margin: 1, width: 280 }).then(setQr);
  }, [roomCode]);

  async function boot() {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as { roomCode: string; sessionToken: string };
      setRoomCode(parsed.roomCode);
      connect({ roomCode: parsed.roomCode, sessionToken: parsed.sessionToken });
      return;
    }
    const response = await fetch(`${apiBase()}/api/rooms`, { method: "POST" });
    const room = (await response.json()) as { roomCode: string; hostToken: string };
    setRoomCode(room.roomCode);
    connect(room);
  }

  function connect(credentials: { roomCode: string; hostToken?: string; sessionToken?: string }) {
    intentionalClose.current = false;
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    ws.onopen = () => {
      setStatus("Connected");
      if (credentials.sessionToken) {
        send("resume_session", { roomCode: credentials.roomCode, role: "host", sessionToken: credentials.sessionToken });
      } else {
        send("host_hello", { roomCode: credentials.roomCode, hostToken: credentials.hostToken });
      }
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "host_ready" || message.type === "resumed") {
        setSessionToken(message.payload.sessionToken);
        localStorage.setItem(storageKey, JSON.stringify({ roomCode: credentials.roomCode, sessionToken: message.payload.sessionToken }));
        setRoster(message.payload.roster);
      }
      if (message.type === "roster_update") setRoster(message.payload.roster);
      if (message.type === "game_state") setGameState(message.payload);
      if (message.type === "room_closed") setStatus(`Room closed: ${message.payload.reason}`);
      if (message.type === "error") setStatus(message.payload.message);
    };
    ws.onclose = (event) => {
      if (intentionalClose.current) return;
      if (event.code === 4001) {
        setStatus("Host session expired. Create a new room.");
        localStorage.removeItem(storageKey);
      } else if (event.code === 4002) {
        setStatus("Disconnected: this host session was opened elsewhere.");
      } else if (event.code === 4003) {
        setStatus("Room closed.");
        localStorage.removeItem(storageKey);
      } else {
        setStatus("Connection lost. Reconnecting...");
        window.setTimeout(() => connect({ roomCode: credentials.roomCode, sessionToken: sessionToken || credentials.sessionToken }), 1000);
      }
    };
  }

  function send(type: string, payload: unknown = {}) {
    wsRef.current?.send(JSON.stringify({ type, v: PROTOCOL_VERSION, payload }));
  }

  const activeCount = useMemo(() => roster.filter((player) => player.connectionState !== "removed").length, [roster]);
  const hostView = gameState?.hostView;

  return (
    <main className="host-shell">
      <section className="stage">
        <div className="brand">partymode</div>
        {gameState?.roomPhase === "in_game" && hostView ? (
          <GamePanel view={hostView} paused={gameState.paused} onNext={() => send("next_phase")} onPlayAgain={() => send("play_again")} />
        ) : (
          <div className="lobby">
            <div>
              <p className="eyebrow">Room code</p>
              <h1>{roomCode || "----"}</h1>
              <p className="status">{status}</p>
              <button disabled={activeCount < 3 || activeCount > 8} onClick={() => send("start_game")}>
                Start game
              </button>
              <button className="secondary" onClick={() => send("end_room")}>
                End room
              </button>
            </div>
            {qr && <img className="qr" src={qr} alt={`Join ${roomCode}`} />}
          </div>
        )}
      </section>
      <aside className="roster">
        <h2>Players {activeCount}/8</h2>
        {roster.map((player) => (
          <div className="player" key={player.id}>
            <span>{player.nickname}</span>
            <small>{player.score} pts · {player.connectionState}</small>
          </div>
        ))}
      </aside>
    </main>
  );
}

function GamePanel(props: { view: HostView; paused: boolean; onNext: () => void; onPlayAgain: () => void }) {
  const { view } = props;
  return (
    <div className="game">
      {props.paused && <div className="banner">Paused: waiting for players to reconnect</div>}
      <p className="eyebrow">Round {view.round}/{view.roundCount} · {view.phase}</p>
      <h1>{view.question ?? view.category ?? "Get ready"}</h1>
      {view.answers && (
        <div className="answers">
          {view.answers.map((answer) => (
            <div className={answer.isCorrect ? "answer correct" : "answer"} key={answer.answerId}>
              <b>{answer.text}</b>
              {answer.authorNickname && <span>{answer.isCorrect ? "Truth" : answer.authorNickname}</span>}
            </div>
          ))}
        </div>
      )}
      {view.scoreDeltas.length > 0 && (
        <div className="deltas">
          {view.scoreDeltas.map((delta) => (
            <span key={delta.nickname}>{delta.nickname} +{delta.delta}</span>
          ))}
        </div>
      )}
      <div className="leaderboard">
        {view.leaderboard.map((entry) => (
          <div key={entry.nickname}>{entry.rank}. {entry.nickname} · {entry.score}</div>
        ))}
      </div>
      {view.phase === "final_results" ? (
        <button onClick={props.onPlayAgain}>Play again</button>
      ) : (
        <button onClick={props.onNext}>Next</button>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
