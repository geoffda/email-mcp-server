/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import express from "express";
import statusRouter from "./routes/status.js";
import entraDiscoveryRouter from "./routes/entra-discovery.js"; // ⭐ ADD THIS
import { errorHandler } from "./middleware/error-handler.js";
import { startMcpServer } from "./mcp/server.js";
import { logger } from "./logging/Logger.js";

export function startServer(testMode = false) {
  const app = express();
  const port = process.env.PORT || 3000;

  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf?.toString() ?? "";
      },
    }),
  );

  // ⭐ Mount Entra discovery BEFORE MCP
  app.use(entraDiscoveryRouter);

  // ⭐ MCP server mounts /mcp
  startMcpServer(app, testMode);

  app.use("/api", statusRouter);

  app.get("/", (req, res) => {
    res.json({ status: "ok", message: "MCP server running" });
  });

  app.use(errorHandler);

  const server = app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
  });

  return server;
}
