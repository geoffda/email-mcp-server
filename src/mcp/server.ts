/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

// src/mcp/server.ts
import "dotenv/config";
import type { Express, Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../logging/Logger.js";
import protectedResource from "../routes/protected-resource.js";
import authServer from "../routes/auth-server.js";
import { requireAuth } from "../middleware/require-auth.js";
import { notFound } from "../middleware/not-found.js";

const CONFIG = {
  host: process.env.HOST || "localhost",
  port: Number(process.env.PORT) || 3000,
};

export function startMcpServer(app: Express, testMode = false) {
  //
  // Logging middleware
  //
  app.use((req, _res, next) => {
    logger.info("[incoming]", req.method, req.url);
    logger.debug("[headers]", req.headers);
    next();
  });

  //
  // CORS
  //
  app.use(
    cors({
      origin: "*",
      exposedHeaders: ["mcp-session-id", "Mcp-Session-Id"],
    }),
  );

  //
  // Session map
  //
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  //
  // MCP server factory
  //
  function createMcpServer() {
    const server = new McpServer({
      name: "email-mcp-server",
      version: "0.0.1",
    });

    server.registerTool(
      "ping",
      {
        description: "Simple health check tool",
        inputSchema: z.object({}),
        outputSchema: z.object({
          ok: z.boolean(),
          timestamp: z.number(),
        }),
      },
      () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              timestamp: Date.now(),
            }),
          },
        ],
        structuredContent: {
          ok: true,
          timestamp: Date.now(),
        },
      }),
    );

    return server;
  }

  // ----------------------------------------------------
  // Authentication sub routes
  // ----------------------------------------------------

  // Well known resource.
  app.use(protectedResource);
  app.use(authServer);

  // ----------------------------------------------------

  //
  // POST /mcp
  //
  app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
    const sessionIdHeader = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    //
    // CASE 1: Existing session
    //
    if (sessionIdHeader && transports[sessionIdHeader]) {
      transport = transports[sessionIdHeader];
    }

    //
    // CASE 2: Unknown session ID → create new session with that ID
    //
    else if (sessionIdHeader && !transports[sessionIdHeader]) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionIdHeader,
        enableJsonResponse: testMode,
        onsessioninitialized: () => {
          transports[sessionIdHeader] = transport;
        },
      });

      transport.onclose = () => {
        delete transports[sessionIdHeader];
      };

      const server = createMcpServer();
      await server.connect(transport);
    }

    //
    // CASE 3: No session ID + initialization request
    //
    else if (!sessionIdHeader && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: testMode,
        onsessioninitialized: (sessionId) => {
          transports[sessionId] = transport;
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
    }

    //
    // CASE 4: Invalid request
    //
    else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    //
    // Handle MCP request
    //
    await transport.handleRequest(req as any, res as any, req.body);
  });

  //
  // GET/DELETE /mcp
  //
  async function handleSession(req: Request, res: Response) {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req as any, res as any);
  }

  app.get("/mcp", handleSession);
  app.delete("/mcp", handleSession);

  // Catch-all 404 (must be last)
  app.use(notFound);

  //
  // Start server
  //
  app.listen(CONFIG.port, CONFIG.host, () => {
    logger.info(
      `🚀 MCP Server running at http://${CONFIG.host}:${CONFIG.port}`,
    );
    logger.info(`📡 MCP endpoint: http://${CONFIG.host}:${CONFIG.port}/mcp`);
  });
}
