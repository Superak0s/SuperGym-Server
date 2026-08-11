import { Router, Request, Response } from "express"
import { authenticateToken } from "../../../middleware/auth.js"
import {
  ValidationError,
} from "../../../middleware/errorHandler.js"
import {
  logSoreness,
  getSorenessHistory,
  deleteSorenessEntry,
} from "./soreness.model.js"

const router: Router = Router()

router.use(authenticateToken)

// ─── Log soreness ────────────────────────────────────────────────────────────

router.post(
  "/",
  async (req: Request, res: Response) => {
    const { muscleGroup, intensity, loggedAt, note } = req.body

    if (!muscleGroup || !intensity) {
      throw new ValidationError("Muscle group and intensity are required")
    }

    if (!Number.isInteger(intensity) || intensity < 1 || intensity > 10) {
      throw new ValidationError("Intensity must be an integer from 1-10")
    }

    const id = await logSoreness(
      req.user!.id,
      muscleGroup,
      intensity,
      loggedAt || null,
      note || null,
    )
    res.status(201).json({ success: true, id })
  },
)

// ─── Get soreness history ────────────────────────────────────────────────────

router.get(
  "/",
  async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 365)
    const history = await getSorenessHistory(req.user!.id, limit)
    res.json({ success: true, data: history })
  },
)

// ─── Delete soreness entry ────────────────────────────────────────────────

router.delete(
  "/:id",
  async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id))
    if (isNaN(id)) throw new ValidationError("Invalid soreness entry ID")
    const deleted = await deleteSorenessEntry(req.user!.id, id)
    if (!deleted) throw new ValidationError("Soreness entry not found")
    res.json({ success: true })
  },
)

export default router
