/**
 * types/analytics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Aggregated analytics result shapes (raw DB column names preserved).
 */

export interface AnalyticsSummary {
  avg_time_between_sets: number
  total_sessions: number
  total_sets: number
  total_volume: number
  avg_rest_time: number
  avg_set_duration: number
}
