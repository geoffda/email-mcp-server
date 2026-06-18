import { startServer } from "./web-server.js";
import express from "express";
import { logger } from "./logging/Logger.js";

import type { Request, Response, NextFunction } from "express";

const app = express();

// ABSOLUTELY FIRST — GLOBAL LOGGER
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info("[incoming]", req.method, req.url);
  logger.info("[headers]", req.headers);
  next();
});

startServer();
