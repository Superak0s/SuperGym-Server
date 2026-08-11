import { Router, Request, Response } from "express"
import { authenticateToken } from "../../../middleware/auth.js"
import {
  ValidationError,
} from "../../../middleware/errorHandler.js"
import {
  createNote,
  getNotesByMuscle,
} from "./personalNotes.model.js"

const router: Router = Router()

router.use(authenticateToken)

// ─── Create note ─────────────────────────────────────────────────────────────

/**
 * POST /api/tracking/personal-notes
 */
router.post(
  "/",
  async (req: Request, res: Response) => {
    const { muscleGroup, content } = req.body

    if (!muscleGroup || !content) {
      throw new ValidationError("Muscle group and content are required")
    }

    const result = await createNote(req.user!.id, muscleGroup, content)
    res.status(201).json({ success: true, data: result })
  },
)

// ─── Get notes by muscle ─────────────────────────────────────────────────────

/**
 * GET /api/tracking/personal-notes/muscle/:muscleGroup
 */
router.get(
  "/muscle/:muscleGroup",
  async (req: Request, res: Response) => {
    const muscleGroup = String(req.params.muscleGroup)
    const notes = await getNotesByMuscle(req.user!.id, muscleGroup)
    res.json({ success: true, data: notes })
  },
)

export default router
