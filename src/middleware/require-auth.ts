// src/middleware/require-auth.ts
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Phase 1: do NOT validate the token yet.
  return next();
}
