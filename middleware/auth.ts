// src/middleware/auth.ts
import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { findUserById, getTokenVersion } from "../features/auth/auth.model.js"
import { UnauthorizedError } from "./errorHandler.js"
import type { JwtPayload } from "../types/index.js"

function extractToken(req: Request): string | null {
  const header = req.headers["authorization"]
  return header ? (header.split(" ")[1] ?? null) : null
}

export async function authenticateToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractToken(req)
  if (!token) return next(new UnauthorizedError("Access token required"))

  try {
    const { userId, tokenVersion } = jwt.verify(
      token,
      process.env.JWT_SECRET!,
      { algorithms: ["HS256"] },
    ) as JwtPayload
    const user = await findUserById(userId)
    if (!user) return next(new UnauthorizedError("User not found"))
    if ((await getTokenVersion(userId)) !== tokenVersion)
      return next(new UnauthorizedError("Token has been revoked"))
    req.user = user
    next()
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError("Invalid or expired token"))
    }
    // Infrastructure error (e.g. DB down) — let it bubble up as a 500
    next(err)
  }
}
