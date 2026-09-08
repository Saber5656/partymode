import "./styles.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PROTOCOL_VERSION, type RosterPlayer } from "@partymode/shared";

type PlayerView = {
  phase: string;
  round: number;
  roundCount: number;
  category?: string;
  question?: string;
  answers?: Array<{ answerId: string; text: string; isOwn?: boolean; isCorrect?: boolean; authorNickname?: string }>;
  scoreDeltas: Array<{ nickname: string; delta: number; total: number }>;
  leaderboard: Array<{ nickname: string; score: number; rank: number }>;
  ownScoreDelta?: number;
};

type GameState = {
  roomPhase: "lobby" | "in_game" | "closed";
  gamePhase: string | null;
  paused: boolean;
  playerView?: PlayerView;
};

function apiBase() {
  return import.meta.env.VITE_SERVER_URL || window.location.origin;
}

function wsUrl() {
  const base = new URL(apiBase());
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return base.toString();
}

function sessionKey(roomCode: string) {
  return `partymode.playerSession.${roomCode}`;
}

function App() {
  const initialCode = new URLSearchParams(window.location.search).get("code") ?? "";
  const [roomCode, setRoomCode] = useState(initialCode.toUpperCase());
  const [nickname, setNickname] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [status, setStatus] = useState("Enter a room code and nickname");
  const [bluff, setBluff] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const intentionalClose = useRef(false);

  useEffect(() => {
    if (!initialCode) return;
    const saved = localStorage.getItem(sessionKey(initialCode.toUpperCase()));
    if (saved) {
      const parsed = JSON.parse(saved) as { roomCode: string; sessionToken: string; playerId: string; nickname: string };
      setNickname(parsed.nickname);
      connect({ roomCode: parsed.roomCode, sessionToken: parsed.sessionToken });
    }
    return () => {
      intentionalClose.current = true;
      wsRef.current?.close();
    };
  }, [initialCode]);

  function connect(credentials: { roomCode: string; nickname?: string; sessionToken?: string }) {
    intentionalClose.current = false;
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    ws.onopen = () => {
      setStatus("Connected");
      if (credentials.sessionToken) {
        send("resume_session", { roomCode: credentials.roomCode, role: "player", sessionToken: credentials.sessionToken });
      } else {
        send("join_room", { roomCode: credentials.roomCode, nickname: credentials.nickname });
      }
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "joined" || message.type === "resumed") {
        const id = message.payload.playerId;
        setPlayerId(id);
        setRoster(message.payload.roster);
        const savedNickname = credentials.nickname || nickname;
        localStorage.setItem(
          sessionKey(credentials.roomCode),
          JSON.stringify({ roomCode: credentials.roomCode, playerId: id, nickname: savedNickname, sessionToken: message.payload.sessionToken })
        );
      }
      if (message.type === "roster_update") setRoster(message.payload.roster);
      if (message.type === "game_state") setGameState(message.payload);
      if (message.type === "room_closed") {
        setStatus(`Room closed: ${message.payload.reason}`);
        localStorage.removeItem(sessionKey(credentials.roomCode));
      }
      if (message.type === "error") {
        setStatus(message.payload.message);
        if (message.payload.code === "session_expired") {
          localStorage.removeItem(sessionKey(credentials.roomCode));
        }
      }
    };
    ws.onclose = (event) => {
      if (intentionalClose.current) return;
      if (event.code === 4001) {
        setStatus("Session expired. Rejoin the room.");
        localStorage.removeItem(sessionKey(credentials.roomCode));
      } else if (event.code === 4002) {
        setStatus("This session was opened elsewhere.");
      } else if (event.code === 4003) {
        setStatus("Room closed.");
        localStorage.removeItem(sessionKey(credentials.roomCode));
      } else {
        setStatus("Connection lost. Reconnecting...");
        const saved = localStorage.getItem(sessionKey(credentials.roomCode));
        if (saved) {
          const parsed = JSON.parse(saved) as { sessionToken: string };
          window.setTimeout(() => connect({ roomCode: credentials.roomCode, sessionToken: parsed.sessionToken }), 1000);
        }
      }
    };
  }

  function send(type: string, payload: unknown = {}) {
    wsRef.current?.send(JSON.stringify({ type, v: PROTOCOL_VERSION, payload }));
  }

  function join() {
    connect({ roomCode: roomCode.trim().toUpperCase(), nickname: nickname.trim() });
  }

  function submitBluff() {
    send("submit_input", { phase: "prompt", data: { bluff } });
    setBluff("");
  }

  function submitVote(answerId: string) {
    setSelectedAnswer(answerId);
    send("submit_input", { phase: "vote", data: { answerId } });
  }

  const me = useMemo(() => roster.find((player) => player.id === playerId), [playerId, roster]);
  const view = gameState?.playerView;

  return (
    <main className="player-shell">
      <div className="topline">
        <b>partymode</b>
        {me && <span>{me.nickname} · {me.score} pts</span>}
      </div>
      {!playerId ? (
        <section className="join">
          <h1>Join room</h1>
          <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ROOM" maxLength={4} />
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Nickname" maxLength={16} />
          <button onClick={join}>Join</button>
          <p>{status}</p>
        </section>
      ) : (
        <section className="controller">
          {gameState?.paused && <div className="banner">Paused: waiting for players to reconnect</div>}
          {!view || gameState?.roomPhase === "lobby" ? (
            <Lobby roster={roster} status={status} />
          ) : (
            <GameView
              view={view}
              bluff={bluff}
              selectedAnswer={selectedAnswer}
              onBluffChange={setBluff}
              onSubmitBluff={submitBluff}
              onVote={submitVote}
            />
          )}
        </section>
      )}
    </main>
  );
}

function Lobby(props: { roster: RosterPlayer[]; status: string }) {
  return (
    <>
      <h1>Waiting room</h1>
      <p>{props.status}</p>
      <div className="roster">
        {props.roster.map((player) => (
          <div key={player.id}>{player.nickname} · {player.connectionState}</div>
        ))}
      </div>
    </>
  );
}

function GameView(props: {
  view: PlayerView;
  bluff: string;
  selectedAnswer: string;
  onBluffChange: (value: string) => void;
  onSubmitBluff: () => void;
  onVote: (answerId: string) => void;
}) {
  const { view } = props;
  return (
    <>
      <p className="eyebrow">Round {view.round}/{view.roundCount} · {view.phase}</p>
      <h1>{view.question ?? view.category ?? "Get ready"}</h1>
      {view.phase === "prompt" && (
        <div className="entry">
          <input value={props.bluff} onChange={(event) => props.onBluffChange(event.target.value)} placeholder="Your fake answer" maxLength={80} />
          <button onClick={props.onSubmitBluff} disabled={!props.bluff.trim()}>Submit</button>
        </div>
      )}
      {view.phase === "vote" && view.answers && (
        <div className="answers">
          {view.answers.map((answer) => (
            <button
              className={props.selectedAnswer === answer.answerId ? "answer selected" : "answer"}
              key={answer.answerId}
              disabled={answer.isOwn}
              onClick={() => props.onVote(answer.answerId)}
            >
              {answer.text}
            </button>
          ))}
        </div>
      )}
      {(view.phase === "reveal" || view.phase === "final_results") && (
        <>
          {view.ownScoreDelta !== undefined && <div className="score">You earned +{view.ownScoreDelta}</div>}
          {view.answers && (
            <div className="reveal">
              {view.answers.map((answer) => (
                <div className={answer.isCorrect ? "truth" : ""} key={answer.answerId}>
                  {answer.text} {answer.authorNickname ? `· ${answer.authorNickname}` : "· Truth"}
                </div>
              ))}
            </div>
          )}
          <div className="leaderboard">
            {view.leaderboard.map((entry) => (
              <div key={entry.nickname}>{entry.rank}. {entry.nickname} · {entry.score}</div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
