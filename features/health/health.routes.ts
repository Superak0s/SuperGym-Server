import { Router, Request, Response } from "express"
import { pool } from "../../config/database.js"
import { authenticateToken } from "../../middleware/auth.js"
import { getAnalytics } from "../analytics/analytics.model.js"

const router: Router = Router()

const GLOBAL_STATS_TTL_MS = 60_000
let globalStatsCache: { totalSessions: number; totalAdminSessions: number; totalUsers: number; expiresAt: number } | null = null

async function getGlobalStats() {
  if (globalStatsCache && globalStatsCache.expiresAt > Date.now())
    return globalStatsCache

  const [[sessionCount], [adminCount], [userCount]] = await Promise.all([
    pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM sessions WHERE is_admin = 0",
    ),
    pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM sessions WHERE is_admin = 1",
    ),
    pool.execute<any[]>("SELECT COUNT(*) as count FROM users"),
  ])

  globalStatsCache = {
    totalSessions: sessionCount[0].count,
    totalAdminSessions: adminCount[0].count,
    totalUsers: userCount[0].count,
    expiresAt: Date.now() + GLOBAL_STATS_TTL_MS,
  }
  return globalStatsCache
}

/**
 * GET /api/health
 * Requires authentication. Returns server status + per-user stats.
 * Global counts are admin-only; cached briefly since they're slowly-changing.
 */
router.get(
  "/",
  authenticateToken,
  async (req: Request, res: Response) => {
    const userAnalytics = await getAnalytics(req.user!.id)

    res.json({
      status: "OK",
      message: "Workout tracker server is running",
      database: "Connected",
      timestamp: new Date().toISOString(),
      ...(req.user!.is_admin
        ? {
            globalStats: (({ expiresAt, ...stats }) => stats)(
              await getGlobalStats(),
            ),
          }
        : {}),
      userStats: {
        username: req.user!.username,
        averageTimeBetweenSets: userAnalytics.avg_time_between_sets || 120,
        totalSessions: userAnalytics.total_sessions || 0,
        totalSetsCompleted: userAnalytics.total_sets || 0,
      },
    })
  },
)

export default router
