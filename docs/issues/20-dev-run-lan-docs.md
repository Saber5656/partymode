# 20 — Local/LAN dev-run instructions + QR LAN-IP handling

## Summary

Make the product actually runnable for its intended real-world use case (a laptop connected to a
TV, phones joining over the same Wi-Fi) and document the exact steps, including how the host
client's QR code correctly encodes the host machine's LAN IP rather than `localhost` (which phones
cannot resolve to the host machine).

## Context

`docs/DESIGN.md` §1.1's "done" checklist requires joining "from 3+ phones over the same Wi-Fi by
scanning the QR code." Issue 11 built QR generation using `window.location.origin`, which is
correct in principle but only if the host app itself was loaded via the LAN IP (not `localhost`)
in the browser — this issue makes that whole path work and documents it for a non-technical user
(the eventual party host) to follow.

## Scope

- Add a `packages/server` (or root-level) helper script (`scripts/print-lan-url.mjs` or similar,
  plain Node, no new dependency needed — Node's `os.networkInterfaces()` is sufficient) that
  prints the machine's LAN IPv4 address(es) so the user knows what URL to open on the TV browser
  (e.g. `http://192.168.1.23:8787`).
- Production-mode single-port serving: extend `apps/server` (from issue 03) to serve the built
  static assets of `apps/host` and `apps/player` from the same HTTP server (e.g. `apps/host`'s
  build output served at `/`, `apps/player`'s at `/join` or a dedicated path — pick one consistent
  scheme and document it), so that opening `http://<lan-ip>:8787/` on the TV browser and
  `http://<lan-ip>:8787/join?code=XXXX` on a phone both work with zero separate dev-server ports
  and zero CORS concerns (this also makes issue 11's QR `window.location.origin` approach correct
  automatically, since host and player are now same-origin).
- Root-level script: `npm run build && npm run start` (or equivalent) that builds all three
  workspace packages then starts `apps/server` in this combined-static-serving mode.
- `docs/RUNBOOK.md` (new file): step-by-step instructions for a non-technical host:
  1. Ensure the laptop and all phones are on the same Wi-Fi network.
  2. Run the build+start command.
  3. Note the printed LAN URL.
  4. Open that URL in the TV/laptop browser (connected to the TV via HDMI or Chromecast/AirPlay
     mirroring — out of scope to automate, just document as a prerequisite).
  5. Players open their phone camera / QR scanner on the displayed QR code, or type the room code
     at `<lan-url>/join`.
  6. Troubleshooting section: Wi-Fi client isolation (some routers/guest networks block device-
     to-device traffic — document this as a known failure mode with no v1 workaround, since fixing
     it requires router configuration outside the app's control), firewall prompts on first server
     start (may need to allow incoming connections), and what to do if the LAN IP changes
     mid-session (it won't, since sessions are short, but note that reconnect after a Wi-Fi network
     change is not supported — matches `docs/DESIGN.md` non-goals).

## Detailed Requirements

1. Do not add HTTPS/TLS for this issue — plain HTTP is acceptable for LAN use per ADR context (TLS
   would require certificate handling that's out of scope for v1's local/LAN target).
2. The static-serving addition to `apps/server` must not break the dev-mode Vite dev servers used
   by issues 01–18 (i.e. `npm run dev:server`/`dev:host`/`dev:player` for active development still
   work as separate ports) — the combined single-port serving is an additional *production* mode
   (`npm run start`), not a replacement for the dev workflow.
3. If multiple LAN IPs are found (e.g. both Wi-Fi and Ethernet adapters active), print all of them
   with adapter names so the user can pick the right one, rather than guessing.

## Acceptance Criteria

- `npm run build && npm run start` (from repo root) starts a single process; visiting the printed
  LAN URL from a second device on the same Wi-Fi network (e.g. a phone) loads the host app's
  `CreateRoom` screen.
- The QR code displayed encodes a URL using the LAN IP (not `localhost` or `127.0.0.1`), verified
  by decoding it on a phone.
- Scanning that QR code on a phone connected to the same Wi-Fi network opens the player `Join`
  screen with the room code pre-filled, and joining succeeds.
- `docs/RUNBOOK.md` exists and a person unfamiliar with the codebase could follow it to run a full
  party session using only a terminal and their phones.

## Validation

- Manual test using an actual second device (phone or another computer) on the same Wi-Fi network
  as the machine running the server, following `docs/RUNBOOK.md` verbatim, and confirming the join
  flow works.

## Dependencies

Issue 11 (host client QR code), Issue 14 (player join screen), Issue 03 (server HTTP bootstrap, to
be extended with static-serving).

## Non-goals

- No internet-facing hosting/deployment (Fly.io/Render/etc.) — LAN/localhost only, per
  `docs/DESIGN.md` §9's known unknown.
- No HTTPS/TLS.
- No handling for Wi-Fi client isolation — documented as a known limitation, not solved.

## Design References

`docs/DESIGN.md` §1.1 (done criteria 2–3), §9 (LAN/localhost-only v1 execution model), §3.1
(runtime topology — single process now also serves static assets).
