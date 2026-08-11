// src/server.ts
import express, { Request, Response, NextFunction } from "express"
import http from "http"
import cors from "cors"
import compression from "compression"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import dotenv from "dotenv"
import { randomUUID } from "crypto"
import packageJson from "./package.json" with { type: "json" }
import { startStaleSessionCleanup, stopStaleSessionCleanup } from "./jobs/sessionCleanup.js"

dotenv.config()

// ─── Fail fast on missing critical env vars ───────────────────────────────────
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET env var is not set")
if (process.env.JWT_SECRET.length < 32)
  throw new Error(
    "JWT_SECRET is too weak — use at least 32 characters of high-entropy randomness",
  )
if (!process.env.ALLOWED_ORIGINS)
  throw new Error(
    "ALLOWED_ORIGINS env var is not set — set it to a comma-separated list of allowed origins (e.g. https://yourapp.com)",
  )

import { testDatabaseConnection, pool } from "./config/database.js"
import { createWsServer, closeWsServer } from "./ws/wsServer.js"
import { registerRoutes } from "./routes.js"
import { errorHandler } from "./middleware/errorHandler.js"

// ─── Extend Express Request with reqId ───────────────────────────────────────
// Declared here rather than in express.d.ts to keep it co-located with the
// only middleware that sets it. If other files need req.reqId, move it to
// src/types/express.d.ts alongside req.user.
declare global {
  namespace Express {
    interface Request {
      reqId?: string
    }
  }
}

const app = express()
const PORT = process.env.PORT || 5000

// ─── Trust the reverse proxy (TLS-terminating, per README/Dockerfile) ─────────
// Without this, req.ip resolves to the proxy's socket address for every
// request, so express-rate-limit keys all clients into one shared bucket.
app.set("trust proxy", 1)

// ─── Security headers ─────────────────────────────────────────────────────────
// This is a JSON API with no HTML views (public/ has no static assets today),
// so lock CSP down to "load nothing" rather than the browser-page-oriented
// defaults helmet ships with.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"] },
    },
  }),
)

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(",").map((o) =>
  o.trim(),
)
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
)

// ─── Response compression ──────────────────────────────────────────────────────
app.use(compression())

// ─── Body parsing ─────────────────────────────────────────────────────────────
// Program uploads need a bigger cap (matches MAX_PROGRAM_JSON_BYTES in
// programs.routes.ts) — mounted ahead of the global 50kb parser, which skips
// bodies express.json has already parsed.
app.use("/api/program/upload", express.json({ limit: "2mb" }))
app.use(express.json({ limit: "50kb" }))
app.use(express.static("public"))

// ─── Request ID ───────────────────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.reqId = randomUUID()
  next()
})

// ─── Request logger (no query params, no body) ────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${req.method}] ${req.path}`, {
    auth: req.headers.authorization ? "present" : "missing",
    reqId: req.reqId,
  })
  next()
})

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Strict limiter on auth endpoints to blunt credential stuffing / brute force,
// plus a broad limiter across the rest of the API to curb abuse and scraping.
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: "Too many requests, please try again later",
    },
  }),
)

app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: "Too many requests, please try again later",
    },
  }),
)

// ─── Unauthenticated liveness check (for Docker/load balancer) ────────────────
app.get("/healthz", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1")
    res.json({ status: "OK" })
  } catch {
    res.status(503).json({ status: "DOWN" })
  }
})

// ─── Routes ───────────────────────────────────────────────────────────────────
registerRoutes(app)

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: "Route not found" })
})

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler)

// ─── Server ───────────────────────────────────────────────────────────────────
const server = http.createServer(app)
createWsServer(server)

async function start() {
  await testDatabaseConnection()
  server.listen(PORT, () => {
    console.log(`🚀 OwnLift Server v${packageJson.version} running on port ${PORT}`)
    startStaleSessionCleanup()
  })
}

start().catch((err) => {
  console.error("Failed to start server:", err)
  process.exit(1)
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(exitCode: number) {
  closeWsServer()
  stopStaleSessionCleanup()
  server.close(async () => {
    try {
      await pool.end()
    } catch (err) {
      console.error("Error closing DB pool:", err)
    }
    process.exit(exitCode)
  })
}

process.on("SIGTERM", () => {
  console.log("SIGTERM received — shutting down gracefully")
  shutdown(0)
})

process.on("SIGINT", () => {
  shutdown(0)
})

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason)
  shutdown(1)
})

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err)
  shutdown(1)
})
