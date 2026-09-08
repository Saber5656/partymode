# partymode v1 Smoke Test

Run this before declaring the MVP usable.

## Scripted baseline

1. Run `npm install`.
2. Run `npm run build`.
3. Start the server with `npm run start`.
4. In another terminal, run `npm run smoke`.
5. Pass condition: the script prints `smoke passed for room XXXX` and exits 0.

The scripted helper creates a room, joins three virtual players, plays three full rounds over the
real WebSocket protocol, reaches `final_results`, and verifies the final host view.

## Manual LAN checklist

1. Follow `docs/RUNBOOK.md` using the LAN URL, not `localhost`.
   Pass: the host display loads the create-room screen.
2. Confirm the host screen shows a four-character room code and QR code.
   Pass: the QR decodes to `<lan-url>/join?code=<roomCode>`.
3. Join with three separate devices or browser profiles using a mix of QR scan and manual code
   entry.
   Pass: all three names appear in the host roster and each player sees the waiting room.
4. Start the game with exactly three players.
   Pass: host and player screens move from lobby into round 1.
5. Play three rounds through `round_intro -> prompt -> vote -> reveal`.
   Pass: prompt inputs are accepted, players cannot vote for their own bluff, reveal shows the
   truth and score deltas.
6. In one round, let one prompt timer expire.
   Pass: the round continues with a no-answer placeholder and the timed-out player gets no prompt
   points.
7. In one vote phase, select a different option before submitting.
   Pass: only the submitted vote affects scoring.
8. Confirm the final leaderboard.
   Pass: displayed totals match the visible reveal deltas accumulated over three rounds.
9. Press **Play again**.
   Pass: the room returns to lobby, roster carries over, and scores reset to 0.
10. Press **End room**.
    Pass: all devices show a terminal room-closed state.

## Reconnect checklist

1. During `prompt`, close and reopen one player tab within 45 seconds.
   Pass: the same player resumes with the same score and can submit if the phase is still open.
2. During `vote`, close and reopen one player tab within 45 seconds.
   Pass: the same player resumes and can vote if the phase is still open.
3. After a player grace period expires, reload that player.
   Pass: the player sees a session-expired message and can rejoin from the join screen.
4. Reload the host mid-game within 60 seconds.
   Pass: the host resumes to the current host view.
5. Open the same host session in a second tab.
   Pass: the older tab shows a session-taken-over message from close code 4002.
6. Drop enough players below three during a game, then reconnect one player still in grace.
   Pass: host and remaining players see the paused state and then the game resumes.
