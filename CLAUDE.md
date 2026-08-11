# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The optional backend for the OwnLift fitness app (sibling repo `../OwnLift-App`, which runs fully offline without this server). A Node.js/TypeScript REST + WebSocket API backed by MySQL, providing cross-device sync, accounts, and real-time social features (friends, joint workouts, live spectating). No ORM — hand-written SQL via `mysql2/promise`.

## Commands

```bash
pnpm install
pnpm dev              # tsx watch server.ts — hot reload dev server
pnpm build             # tsc + copies config/schema.sql into dist/config/
pnpm start             # node dist/server.js (run after build)
pnpm admin list|add|remove <username>   # tsx admin.ts — manage admin users
```

There is no test suite and no linter configured in this repo — don't invent `pnpm test`/`pnpm lint` commands.

Requires a `.env` (see README.md for the full variable table). At minimum `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` (≥32 chars), and `ALLOWED_ORIGINS` must be set or the server throws on boot (`server.ts`). The DB and schema auto-provision on first connect against a fresh database.

## Architecture

**Request pipeline** (`server.ts`): `helmet` → `cors` (locked to `ALLOWED_ORIGINS`) → `express.json` (50kb limit) → static `public/` → per-request UUID (`req.reqId`) + logger → rate limiters (`/api/auth`: 20/15min, `/api`: 200/60s) → routes → 404 → global `errorHandler`. The HTTP server and the WebSocket server (`ws/wsServer.ts`) share the same `http.createServer` instance.

**Layering**: `routes/*` (Express routers, request validation, calling models/services) → `models/*` (SQL queries against `mysql2` pool) → `config/database.ts` (pool + schema bootstrap). A few cross-cutting `services/*` (analytics, workout/session logic) sit between routes and models where logic doesn't map to a single table. `routes/index.ts` is the single place every router gets mounted — add new route modules there.

Routes and models are grouped by domain into `social/` and `tracking/` subdirectories (e.g. `routes/tracking/macros.ts` + `models/tracking/macros.ts`). When adding a new tracking metric or social feature, follow this same route+model pairing and subdirectory placement.

**Auth**: JWT (HS256, `jsonwebtoken`) verified in `middleware/auth.ts`. `authenticateToken` requires a valid token and attaches `req.user`. Passwords hashed with bcryptjs (12 rounds). The first-ever registered user auto-becomes admin (`routes/admin.ts` / `admin.ts` CLI manage further admins).

**Errors**: `middleware/errorHandler.ts` defines typed error classes (e.g. `UnauthorizedError`) and the global handler; routes/middleware should throw/`next()` these rather than crafting raw error responses. `NODE_ENV=production` masks internal error details.

**WebSockets** (`ws/wsServer.ts`, mounted at `/ws`): auth via a one-time ticket (`POST /api/auth/ws-ticket`) or a JWT `auth` message fallback, 5s auth timeout, per-user 20 msg/sec limit, 8KB max message size, 30s heartbeat, zombie-connection replacement. Ticket store and rate counters are in-process memory — **the server is single-instance only**; horizontal scaling needs a shared store.

**Background jobs**: `jobs/sessionCleanup.ts` auto-ends workout sessions idle >30min; runs on boot then every 5min, reentrancy-guarded.

**Database**: schema lives in `config/schema.sql`, entirely `CREATE TABLE IF NOT EXISTS` statements, re-run idempotently on every boot. New tables for tracking features go in `ensureAdditionalTrackingTables()` (`config/database.ts`) using the same idempotent pattern — don't hand-edit `schema.sql` for changes to an existing deployment.

**Uploads**: `multer` — memory storage for photos (stored as `LONGBLOB` in MySQL, 10MB cap, image-only), disk storage for legacy spreadsheet uploads. Workout program spreadsheets are parsed client-side in the app; the server only validates and stores the resulting JSON (2MB cap).

**Module system**: ESM (`"type": "module"` in package.json). Local imports must use explicit `.js` extensions even though source is `.ts` (NodeNext resolution) — e.g. `import { foo } from "../models/auth.js"`.

## Releasing

`release.sh` (or `release.bat` on Windows) bumps the version, commits & pushes to `origin main`, then builds and pushes `superak0s/ownlift-server:latest` and `:<version>` to Docker Hub. This is a real deploy action — don't run it without being asked to release.
