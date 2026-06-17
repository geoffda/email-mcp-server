/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable no-control-regex */

import express from "express";
import bodyParser from "body-parser";
import statusRouter from "./routes/status.js";
import { errorHandler } from "./middleware/error-handler.js";
import { startMcpServer } from "./middleware/http-adapter.js";

export function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  // Global JSON for everything else
  app.use(express.json());

  // Raw parser only for /mcp so the transport can parse the JSON-RPC stream itself.
  // Use type "*/*" to accept any content-type the client sends.
  const rawParser = bodyParser.raw({ type: "*/*", limit: "10mb" });

  // Mount MCP endpoint: ensure rawParser is applied before adapter middleware
  app.post("/mcp", rawParser, (req, res, next) => {
    // Let the adapter middleware handle the request; startMcpServer will mount it.
    next();
  });

  // Wire adapter (mounts the adapter middleware at /mcp)
  startMcpServer(app, /* testMode */ false);

  // Other routes keep using parsed JSON
  app.use("/api", statusRouter);

  app.get("/", (req, res) => {
    res.json({ status: "ok", message: "MCP server running" });
  });

  // App-level error handler
  app.use(errorHandler);

  app.listen(port, () => {
    console.error(`Server listening on port ${port}`);
  });
}
