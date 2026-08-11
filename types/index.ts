/**
 * types/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Barrel for every domain type. Import from here ("../types") — the concrete
 * declarations live in the per-domain files below and are re-exported so
 * callers keep a single import entry point.
 */

export * from "./db.js"
export * from "../features/auth/auth.types.js"
export * from "../features/auth/user.types.js"
export * from "../features/programs/programs.types.js"
export * from "../features/workouts/workouts.types.js"
export * from "../features/analytics/analytics.types.js"
export * from "../features/tracking/tracking.types.js"
export * from "../features/social/social.types.js"
export * from "../features/tracking/supplements/supplements.types.js"
