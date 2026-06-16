/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable no-empty */
/* eslint-disable no-control-regex */

import express from "express";
import bodyParser from "body-parser";
import { Readable } from "stream";
import statusRouter from "./routes/status.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createMcpMiddleware } from "./mcp/server.js";

export function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  // Global JSON for everything else
  app.use(express.json());

  // Raw parser only for /mcp so the transport can parse the JSON-RPC stream itself.
  // Use type "*/*" to accept any content-type the client sends.
  const rawParser = bodyParser.raw({ type: "*/*", limit: "10mb" });

  // Create the MCP middleware factory (keeps MCP lifecycle in mcp/server.ts)
  const mcpMiddleware = createMcpMiddleware();

  // Mount /mcp with raw parser and a small adapter that recreates a readable stream
  app.post("/mcp", rawParser, (req, res, next) => {
    try {
      // If body-parser produced a Buffer, recreate a Readable stream for the transport.
      // If body-parser didn't run or req.body is already a stream/object, fall back to original req.
      if (Buffer.isBuffer(req.body)) {
        const buf: Buffer = req.body;

        // Create a new Readable stream from the buffer
        const stream = new Readable({
          read() {
            this.push(buf);
            this.push(null);
          },
        });

        // Copy the minimal properties the transport expects
        // (headers, method, url, httpVersion, etc.)
        // Keep TypeScript happy by casting to any when calling transport.
        (stream as any).headers = req.headers;
        (stream as any).method = req.method;
        (stream as any).url = req.url;
        (stream as any).socket = req.socket;
        (stream as any).connection = req.connection;

        // Call the MCP middleware with the recreated stream as the request object.
        // The middleware expects (req,res,next) and will call transport.handleRequest(req,res).
        return (mcpMiddleware as any)(stream, res, next);
      }

      // If req.body is not a Buffer (unexpected), just call middleware with original req.
      return mcpMiddleware(req as any, res as any, next);
    } catch (err) {
      next(err);
    }
  });

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
