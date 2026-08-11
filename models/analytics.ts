// src/models/analytics.ts
import type { RowDataPacket } from "mysql2"
import { query as dbQuery } from "../config/database.js"
import type { AnalyticsSummary } from "../types/index.js"

export type { AnalyticsSummary }

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface AnalyticsSummaryRow extends RowDataPacket {
  avg_time_between_sets: number
  total_sessions: number
  total_sets: number
  total_volume: number
  avg_rest_time: number
  avg_set_duration: number
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getAnalytics(
  userId: number,
  person?: string | null,
  dayNumber?: number | null,
): Promise<AnalyticsSummary> {
  let q = `
    SELECT
      COALESCE(ROUND(AVG(st.set_duration + COALESCE(st.rest_time, 0))), 120) AS avg_time_between_sets,
      COUNT(DISTINCT s.id) AS total_sessions,
      COUNT(st.id) AS total_sets,
      COALESCE(SUM(st.weight * st.reps), 0) AS total_volume,
      COALESCE(ROUND(AVG(st.rest_time)), 0) AS avg_rest_time,
      COALESCE(ROUND(AVG(st.set_duration)), 0) AS avg_set_duration
    FROM sessions s
    LEFT JOIN set_timings st ON s.id = st.session_id
    WHERE s.user_id = ? AND s.is_admin = 0 AND s.end_time IS NOT NULL`
  const params: unknown[] = [userId]
  if (person) {
    q += ` AND s.person = ?`
    params.push(person)
  }
  // Use != null so dayNumber = 0 is still applied (falsy check would skip it)
  if (dayNumber != null) {
    q += ` AND s.day_number = ?`
    params.push(dayNumber)
  }
  const [rows] = await dbQuery<AnalyticsSummaryRow[]>(q, params)
  return rows[0]
}
