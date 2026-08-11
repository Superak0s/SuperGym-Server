import { Router, Request, Response } from "express"
import multer from "multer"
import { authenticateToken } from "../../../middleware/auth.js"
import { ValidationError } from "../../../middleware/errorHandler.js"
import {
  uploadPhoto,
  getAllPhotos,
  getPhotosByMuscle,
  getPhotosInRange,
  getPhotoImage,
  deletePhoto,
} from "./progressPhoto.model.js"

const router: Router = Router()

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

// Magic-byte signatures, since Content-Type is client-supplied and unverified.
function matchesImageSignature(mimetype: string, buf: Buffer): boolean {
  switch (mimetype) {
    case "image/jpeg":
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    case "image/png":
      return buf.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    case "image/webp":
      return buf.subarray(0, 4).toString("ascii") === "RIFF" &&
        buf.subarray(8, 12).toString("ascii") === "WEBP"
    default:
      return false
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Only JPEG, PNG, or WebP images are allowed"))
    }
  },
})

router.use(authenticateToken)

/**
 * POST /api/tracking/progress-photos
 */
router.post(
  "/",
  upload.single("photo"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError("No photo file provided")
    }
    if (!matchesImageSignature(req.file.mimetype, req.file.buffer)) {
      throw new ValidationError("File content does not match declared image type")
    }

    const { takenAt, notes, angle, customSideName } = req.body
    let muscleGroups: string[] = []
    if (req.body.muscleGroups) {
      try {
        muscleGroups = JSON.parse(req.body.muscleGroups)
      } catch {
        throw new ValidationError("muscleGroups must be a JSON array")
      }
    }
    if (!Array.isArray(muscleGroups) || muscleGroups.length === 0) {
      throw new ValidationError("At least one muscle group is required")
    }

    const id = await uploadPhoto(
      req.user!.id,
      req.file.buffer,
      req.file.mimetype,
      muscleGroups,
      notes || null,
      angle || "custom",
      customSideName || null,
      takenAt || null,
    )

    res.status(201).json({ success: true, id })
  },
)

/**
 * GET /api/tracking/progress-photos
 */
router.get(
  "/",
  async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500)
    const photos = await getAllPhotos(req.user!.id, limit)
    res.json({ success: true, data: photos })
  },
)

/**
 * GET /api/tracking/progress-photos/muscle/:muscle
 */
router.get(
  "/muscle/:muscle",
  async (req: Request, res: Response) => {
    const photos = await getPhotosByMuscle(req.user!.id, String(req.params.muscle))
    res.json({ success: true, data: photos })
  },
)

/**
 * GET /api/tracking/progress-photos/range?start=&end=
 */
router.get(
  "/range",
  async (req: Request, res: Response) => {
    const { start, end } = req.query
    if (!start || !end) {
      throw new ValidationError("start and end query params are required")
    }
    const photos = await getPhotosInRange(req.user!.id, String(start), String(end))
    res.json({ success: true, data: photos })
  },
)

/**
 * GET /api/tracking/progress-photos/:id/image
 */
router.get(
  "/:id/image",
  async (req: Request, res: Response) => {
    const photoId = parseInt(String(req.params.id))
    if (isNaN(photoId)) throw new ValidationError("Invalid photo ID")
    const result = await getPhotoImage(req.user!.id, photoId)

    res.set("Content-Type", result.mimeType)
    res.set("Cache-Control", "private, max-age=86400")
    res.send(result.photoData)
  },
)

/**
 * DELETE /api/tracking/progress-photos/:id
 */
router.delete(
  "/:id",
  async (req: Request, res: Response) => {
    const photoId = parseInt(String(req.params.id))
    if (isNaN(photoId)) throw new ValidationError("Invalid photo ID")
    await deletePhoto(req.user!.id, photoId)
    res.json({ success: true })
  },
)

export default router
