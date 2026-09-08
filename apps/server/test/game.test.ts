import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerId } from "@partymode/shared";
import { BluffTriviaEngine } from "../src/game/bluffTrivia.ts";

const players = [
  { id: "p1" as PlayerId, nickname: "Ada" },
  { id: "p2" as PlayerId, nickname: "Ben" },
  { id: "p3" as PlayerId, nickname: "Cal" }
];

test("bluff trivia scores truth guesses and fooled votes", () => {
  const engine = new BluffTriviaEngine(players);
  engine.advancePhaseForTest("prompt");
  engine.submit("p1" as PlayerId, { bluff: "Mars" });
  engine.submit("p2" as PlayerId, { bluff: "Venus" });
  engine.submit("p3" as PlayerId, { bluff: "Jupiter" });

  const voteView = engine.getPlayerView("p1" as PlayerId).answers;
  const correct = voteView.find((answer) => answer.answerId.endsWith(":correct"));
  const p1Bluff = voteView.find((answer) => answer.authorPlayerId === "p1");
  const p2Bluff = voteView.find((answer) => answer.authorPlayerId === "p2");
  assert.ok(correct);
  assert.ok(p1Bluff);
  assert.ok(p2Bluff);

  engine.submit("p1" as PlayerId, { answerId: correct.answerId });
  engine.submit("p2" as PlayerId, { answerId: p1Bluff.answerId });
  engine.submit("p3" as PlayerId, { answerId: p2Bluff.answerId });

  const reveal = engine.getHostView();
  assert.equal(reveal.phase, "reveal");
  assert.equal(reveal.scoreDeltas.find((delta) => delta.playerId === "p1")?.delta, 1500);
  assert.equal(reveal.scoreDeltas.find((delta) => delta.playerId === "p2")?.delta, 500);
  assert.equal(reveal.scoreDeltas.find((delta) => delta.playerId === "p3")?.delta, 0);
});

test("reserved no-answer sentinel is rejected for player bluff input", () => {
  const engine = new BluffTriviaEngine(players);
  engine.advancePhaseForTest("prompt");
  assert.throws(() => engine.submit("p1" as PlayerId, { bluff: "-- no answer --" }));
});
