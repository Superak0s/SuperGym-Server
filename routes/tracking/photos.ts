// routes/tracking/photos.ts
import { Router, Request, Response } from "express"
import multer from "multer"
import { authenticateToken } from "../../middleware/auth.js"
import { ValidationError } from "../../middleware/errorHandler.js"
import {
  saveProgressPhoto,
  getPhotoList,
  getPhotoData,
  deleteProgressPhoto,
} from "../../models/tracking/photos.js"

const router: Router = Router()

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
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
    case "image/gif":
      return buf.subarray(0, 6).toString("ascii") === "GIF87a" ||
        buf.subarray(0, 6).toString("ascii") === "GIF89a"
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
      cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"))
    }
  },
})

router.use(authenticateToken)

/**
 * POST /api/tracking/photos
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

    const { takenAt, note } = req.body
    const id = await saveProgressPhoto(
      req.user!.id,
      req.file.buffer,
      req.file.mimetype,
      takenAt || null,
      note || null,
    )

    res.status(201).json({ success: true, id })
  },
)

/**
 * GET /api/tracking/photos
 */
router.get(
  "/",
  async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const photos = await getPhotoList(req.user!.id, limit)
    res.json({ success: true, photos })
  },
)

/**
 * GET /api/tracking/photos/:id
 */
router.get(
  "/:id",
  async (req: Request, res: Response) => {
    const photoId = parseInt(String(req.params.id))
    const result = await getPhotoData(req.user!.id, photoId)

    res.set("Content-Type", result.mimeType)
    res.set("Cache-Control", "private, max-age=86400")
    res.send(result.photoData)
  },
)

/**
 * DELETE /api/tracking/photos/:id
 */
router.delete(
  "/:id",
  async (req: Request, res: Response) => {
    const photoId = parseInt(String(req.params.id))
    const deleted = await deleteProgressPhoto(req.user!.id, photoId)

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Photo not found" })
    }

    res.json({ success: true })
  },
)

export default router
