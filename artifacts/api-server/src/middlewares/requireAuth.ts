import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

const DEV_BYPASS =
  process.env.DEV_AUTH_BYPASS === "true" ||
  process.env.DEV_AUTH_BYPASS === "1";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (DEV_BYPASS) {
    (req as unknown as { auth?: unknown }).auth = {
      userId: "dev_bypass_user",
      sessionClaims: { userId: "dev_bypass_user" },
    };
    next();
    return;
  }
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
