# Card Rush – multiplayer card game (unofficial UNO-inspired)

Play 2–20 players with friends on any device through a private room code / invite link, or play against 1–19 bots. Original artwork and name; **not affiliated with Mattel or UNO®**.

- Standard rules by default + optional house rules (stacking, 7-0, jump-in, draw-until-playable, force play) – see [docs/RULES.md](docs/RULES.md).
- Server-authoritative multiplayer with persistent sessions: refresh, close the tab or lose network and you resume the exact seat, hand and turn.
- Mobile-first React UI, bots in 3 difficulties, tests for engine / server / browser.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Zustand · Node.js + `ws` WebSocket server · optional Postgres · Vitest · Playwright.

### Architecture decision (deviation from the preferred Supabase stack)

The brief prefers Supabase. I built a small **Node WebSocket server** instead because the game engine is shared TypeScript: the same code runs on the server (authoritative) and in the browser (solo bot mode) and can be tested end-to-end locally without a cloud account. Supabase **Postgres** is still supported as the persistence layer (`DATABASE_URL`). The Supabase Realtime / Edge-Function variant was **not** built.

```
shared/   pure engine (no React/Node): deck, rules, game, bots, room logic, protocol, views
server/   RoomManager (auth, grace period, persistence), HTTP+WS app, stores (file / Postgres)
src/      React UI (screens, components), net layer (online reconnecting client, solo session)
e2e/      Playwright tests          docs/RULES.md   rules documentation
```

Security model: the server holds all hands; clients only receive a per-player view (own hand, others' card counts; all hands revealed only after the round ends). Every action is validated by the engine (turn, legality, phase), de-duplicated by action id, and version-checked so two tabs cannot submit conflicting moves. Credentials are random 20-char secrets stored as SHA-256 hashes; the same secret is the "recovery code". Room codes are 6 characters from a 32-letter alphabet.

## Run locally

```bash
npm install
cp .env.example .env        # optional
npm run dev                 # server :8787 + Vite :5173 (open http://localhost:5173)
```

Production-style single process: `npm run build && npm start` → http://localhost:8787 (serves the built frontend and `/ws`). Rooms are persisted to `./data` (JSON per room) unless `DATABASE_URL` is set.

## Tests

```bash
npm run lint && npm run typecheck && npm run build
npm test              # unit (engine, rules, bots, room) + integration (real WebSockets, restart recovery)
npm run test:e2e      # Playwright, uses installed Google Chrome (E2E_CHANNEL=chromium to use Playwright's build)
```

Covered: deck/deal/limits, moves, turns, Reverse/Skip/+2, wilds, +4 legality & challenge both outcomes, UNO & catch, stacking, 7-0, jump-in, draw-until-playable, force play, reshuffle, winner/scoring, removal policy, full simulated games with 2–20 bots on all difficulties and rule sets; integration: create/join, 20-player cap, minimum 2, realtime sync, privacy, concurrent tabs, idempotent retries, refresh/offline/reconnect, pause/resume, host refresh, host removal, removed credentials, server-restart recovery, room expiry, full game over sockets; e2e: lobby→game→full game→restart, invite links, recovery on another device, disconnect pause UI, host removal, bots incl. 19 bots, desktop/mobile layout.

## Backend configuration (`.env.example`)

| Variable                   | Purpose                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`                     | HTTP/WS port (default 8787)                                                                                                                                                                      |
| `DATA_DIR`                 | file persistence folder (default `./data`)                                                                                                                                                       |
| `DATABASE_URL`             | optional Postgres/Supabase connection string; creates table `chromarush_rooms` automatically. **Not covered by automated tests** (needs a live DB). Use the Supabase _pooler_ connection string. |
| `ALLOWED_ORIGINS`          | comma separated origins allowed to open the WebSocket (set when frontend is hosted separately)                                                                                                   |
| `DISCONNECT_GRACE_SECONDS` | tolerated drop time before "disconnected" is shown (never skips turns)                                                                                                                           |
| `VITE_WS_URL`              | build-time `wss://…/ws` when the frontend is hosted apart from the server                                                                                                                        |

No secrets live in the repo; never commit `.env`.

## Deploy (free tier)

Option A – one service (simplest): push to GitHub → Render → _New → Blueprint_ (uses [render.yaml](render.yaml)). Optionally add `DATABASE_URL` from a free Supabase/Neon project.
Option B – split: frontend on Cloudflare Pages (`npm run build`, output `dist`, env `VITE_WS_URL=wss://<server>/ws`) and the Node server on Render/Fly/any Node host with `ALLOWED_ORIGINS=https://<your-pages-domain>`.

### Free-tier limits (checked Nov 2026 – verify, they change)

- **Render free web service:** spins down after 15 min without inbound traffic (WebSocket messages count), takes up to ~1 min to wake; 750 free instance-hours/month per workspace; **ephemeral disk** – so file persistence is lost on redeploy/restart/spin-down. Use `DATABASE_URL` for durable games. Idle rooms disappear after the TTL (lobby 2 h, game 24 h) anyway. ([Render docs](https://render.com/docs/free))
- **Supabase free:** projects with low activity are paused after 7 days; 500 MB database, 2 active projects; I could not confirm Realtime connection quotas (not used). ([Supabase docs](https://supabase.com/docs/guides/platform/free-project-pausing))
- **Cloudflare Pages free:** 500 builds/month, 1 concurrent build, unlimited static bandwidth. ([Cloudflare docs](https://developers.cloudflare.com/pages/platform/limits))

## Known limitations

- Bot mode runs in the browser (state kept in `localStorage`); it is not server-authoritative, which is fine for solo play.
- Friends rooms contain humans only (no bots mixed in) and are single-round-at-a-time with cumulative scores.
- A winning final card ends the round immediately (a final illegal +4 cannot be challenged).
- Wild colour picker shows all four colours – none is ever invalid under the rules, so none is disabled.
- Postgres storage and real cross-device/internet play (beyond localhost) were not exercised in this environment; free hosts' cold starts mean the first connection after idle can take ~1 minute (the client keeps retrying automatically).
- Single server instance only (rooms live in memory + storage); horizontal scaling would need sticky routing or a pub/sub layer.
