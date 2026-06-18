import type { Request, Response, NextFunction } from "express";
import { logger } from "../logging/Logger.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // Safely extract a string error code if present
  let code: string | undefined;

  if (typeof err === "object" && err !== null && "code" in err) {
    const maybeCode = (err as { code?: unknown }).code;
    if (typeof maybeCode === "string") {
      code = maybeCode;
    }
  }

  // Ignore harmless client disconnects
  if (code === "ECONNRESET") {
    return;
  }

  // Log meaningful errors only
  if (err instanceof Error) {
    logger.error("Unhandled error:", err.message);
    logger.error(err.stack);
  } else {
    logger.error("Unhandled non-Error value:", err);
  }

  if (!res.headersSent) {
    res.status(500).json({
      ok: false,
      error: "Internal server error",
    });
  }
}
