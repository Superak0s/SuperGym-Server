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
pnpm ownlift list|add|remove <username>   # tsx ownlift.ts — manage admin users (docker: `docker exec <container> ownlift ...`)
```

There is no test suite and no linter configured in this repo — don't invent `pnpm test`/`pnpm lint` commands.

Requires a `.env` (see README.md for the full variable table). At minimum `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` (≥32 chars), and `ALLOWED_ORIGINS` must be set or the server throws on boot (`server.ts`). The DB and schema auto-provision on first connect against a fresh database.

## Architecture

**Request pipeline** (`server.ts`): `helmet` (CSP locked to `default-src 'none'` — pure JSON API, no HTML views) → `cors` (locked to `ALLOWED_ORIGINS`) → `compression` → `express.json` (50kb limit; `/api/program/upload` gets its own 2mb-limit parser mounted first) → static `public/` → per-request UUID (`req.reqId`) + logger → rate limiters (`/api/auth`: 20/15min, `/api`: 200/60s) → unauthenticated `GET /healthz` liveness check (for Docker/load balancer, distinct from `/api/health`) → routes → 404 → global `errorHandler`. `app.set("trust proxy", 1)` is required behind the TLS-terminating reverse proxy or rate-limit keys collapse onto one bucket. The HTTP server and the WebSocket server (`ws/wsServer.ts`) share the same `http.createServer` instance.

**Feature-first layout**: code lives under `features/<domain>/`, not in top-level `routes/`/`models/` directories. Each feature is a flat trio of same-named files: `<name>.routes.ts` (Express router, request validation), `<name>.model.ts` (SQL queries against the `mysql2` pool), and often `<name>.types.ts`. Bigger domains nest sub-features one level deeper — `features/tracking/<metric>/<metric>.{routes,model}.ts` (`bodyStats`, `bodyMeasurements`, `customMeasurements`, `hydration`, `soreness`, `macros`, `supplements`, `menstrual`, `doms`, `injury`, `personalNotes`, `photos`, `progressPhoto`) and `features/social/<subfeature>/` (`friends`, `sharing`). Workout sessions live in `features/workouts/` (mounted at `/api/sessions`, not `/api/workouts`). `routes.ts` at the repo root is the single place every router gets mounted via `registerRoutes(app)` — add new route modules there, following the existing `app.use("/api/...", ...)` list.

**Auth**: JWT (HS256, `jsonwebtoken`) verified in `middleware/auth.ts`. `authenticateToken` requires a valid token and attaches `req.user`. Passwords hashed with bcryptjs (12 rounds). The first-ever registered user auto-becomes admin (`features/auth/`; `ownlift.ts` CLI manages further admins).

**Errors**: `middleware/errorHandler.ts` defines typed error classes (e.g. `UnauthorizedError`) and the global handler; routes/middleware should throw/`next()` these rather than crafting raw error responses. `NODE_ENV=production` masks internal error details.

**WebSockets** (`ws/wsServer.ts`, mounted at `/ws`): auth via a one-time ticket (`POST /api/auth/ws-ticket`) or a JWT `auth` message fallback, 5s auth timeout, per-user 20 msg/sec limit, 8KB max message size, 30s heartbeat, zombie-connection replacement. Ticket store and rate counters are in-process memory — **the server is single-instance only**; horizontal scaling needs a shared store.

**Background jobs**: `jobs/sessionCleanup.ts` auto-ends workout sessions idle >30min; runs on boot then every 5min, reentrancy-guarded.

**Database**: schema lives in `config/schema.sql`, entirely `CREATE TABLE IF NOT EXISTS` statements, re-run idempotently on every boot. New tables for tracking features go in `ensureAdditionalTrackingTables()` (`config/database.ts`) using the same idempotent pattern — don't hand-edit `schema.sql` for changes to an existing deployment. Changes to *existing* tables (new columns, indexes) go in a new `migrations/NNN_description.sql` file instead — `runMigrations()` (`config/database.ts`) applies each one at most once, tracked in a `_migrations` table, in filename order on every boot. `pnpm build` copies `migrations/` into `dist/` alongside `schema.sql`.

**Uploads**: `multer` — memory storage for photos (stored as `LONGBLOB` in MySQL, 10MB cap, image-only), disk storage for legacy spreadsheet uploads. Workout program spreadsheets are parsed client-side in the app; the server only validates and stores the resulting JSON (2MB cap).

**Module system**: ESM (`"type": "module"` in package.json). Local imports must use explicit `.js` extensions even though source is `.ts` (NodeNext resolution) — e.g. `import { findUserByEmail } from "../auth/user.model.js"`.

## Releasing

`release.sh` (or `release.bat` on Windows) bumps the version, commits & pushes to `origin main`, then builds and pushes `superak0s/ownlift-server:latest` and `:<version>` to Docker Hub. This is a real deploy action — don't run it without being asked to release.
