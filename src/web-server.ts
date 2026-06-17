/* eslint-disable @typescript-eslint/no-explicit-any */

import express from "express";
import statusRouter from "./routes/status.js";
import { errorHandler } from "./middleware/error-handler.js";
import { startMcpServer } from "./mcp/server.js";

export function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  /**
   * IMPORTANT:
   * We do NOT call express.json() or body-parser anywhere.
   * MCP requires raw bytes, and Express must not consume the body.
   */

  // Mount MCP endpoint (raw HTTP → MCP transport)
  startMcpServer(app);

  // Other routes (no JSON body parsing needed)
  app.use("/api", statusRouter);

  app.get("/", (req, res) => {
    res.json({ status: "ok", message: "MCP server running" });
  });

  app.use(errorHandler);

  app.listen(port, () => {
    console.error(`Server listening on port ${port}`);
  });
}
