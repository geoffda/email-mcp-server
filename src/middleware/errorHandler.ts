import type { Request, Response } from "express";

export function errorHandler(err: unknown, req: Request, res: Response) {
  console.error("Unhandled error:", err);

  if (typeof res.status === "function") {
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
    });
  }

  // Non-HTTP context — just log and continue
  return;
}
