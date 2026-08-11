// routes/analytics.ts
import { Router, Request, Response } from "express"
import { authenticateToken } from "../middleware/auth.js"
import { ValidationError } from "../middleware/errorHandler.js"
import { getAnalytics } from "../models/analytics.js"
import { getSessionStats } from "../models/workout.js"

const router: Router = Router()

/**
 * GET /api/analytics
 */
router.get(
  "/",
  authenticateToken,
  async (req: Request, res: Response) => {
    const userId = req.user!.id
    const { person, dayNumber } = req.query

    let parsedDayNumber: number | null = null
    if (dayNumber !== undefined) {
      parsedDayNumber = parseInt(dayNumber as string, 10)
      if (isNaN(parsedDayNumber) || parsedDayNumber < 1) {
        throw new ValidationError("dayNumber must be a positive integer")
      }
    }

    console.log(
      `[GET /api/analytics] User ${userId}, person: ${person || "all"}, day: ${parsedDayNumber ?? "all"}`,
    )

    const [analytics, stats] = await Promise.all([
      getAnalytics(userId, (person as string) || null, parsedDayNumber),
      getSessionStats(userId, (person as string) || null, parsedDayNumber),
    ])

    res.json({
      success: true,
      totalSessions: analytics.total_sessions || 0,
      totalSetsCompleted: analytics.total_sets || 0,
      averageTimeBetweenSets: analytics.avg_time_between_sets || 120,
      totalVolume: Math.round(analytics.total_volume || 0),
      averageRestTime: Math.round(analytics.avg_rest_time || 0),
      averageSetDuration: Math.round(analytics.avg_set_duration || 0),
      firstSession: stats.first_session,
      lastSession: stats.last_session,
    })
  },
)

export default router
