import type { Request, Response } from "express";

export function errorHandler(err: unknown, req: Request, res: Response) {
  console.error("Unhandled error:", err);

  res.status(500).json({
    ok: false,
    error: "Internal server error",
  });
}
