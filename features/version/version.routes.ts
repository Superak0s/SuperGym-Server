import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { authenticateToken } from "../../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router: Router = Router();

let cachedVersion: string;
try {
  const packageJsonPath = path.resolve(__dirname, "../../package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  cachedVersion = packageJson.version || "0.0.0";
} catch (error) {
  console.error("❌ Error reading version:", (error as Error).message);
  cachedVersion = "0.0.0";
}

/**
 * GET /api/version
 *
 * Auth-gated: exposes the exact server version which could be used to
 * target known CVEs. Only authenticated users (e.g. the app itself after
 * sign-in) should see this.
 */
router.get("/", authenticateToken, (req: Request, res: Response) => {
  res.json({
    success: true,
    version: cachedVersion,
  });
});

export default router;
