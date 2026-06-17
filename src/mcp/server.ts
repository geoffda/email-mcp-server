/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { z } from "zod";

export const MCP_DEBUG = process.env.MCP_DEBUG === "true";

export function dbg(...args: unknown[]) {
  if (MCP_DEBUG) console.debug(...args);
}

export type McpSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, McpSession>();

export function createMcpSession(
  sessionId: string,
  testMode = false,
): McpSession {
  dbg(`[mcp] creating session ${sessionId}`);

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

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
    enableJsonResponse: testMode,
  });

  void server.connect(transport);

  dbg(`[mcp] session ${sessionId} created`);
  return { server, transport };
}

/**
 * Minimal adapter: Express hands raw HTTP request/response directly to MCP transport.
 * No body parsing. No reconstruction. No JSON parsing. No raw-body hacks.
 */
export function startMcpServer(app: Express, testMode = false) {
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"]?.toString() || randomUUID();

    let session = sessions.get(sessionId);
    if (!session) {
      session = createMcpSession(sessionId, testMode);
      sessions.set(sessionId, session);
    }

    try {
      await session.transport.handleRequest(req as any, res as any);
    } catch (err: any) {
      console.error("[mcp] transport error:", err?.message ?? err);
      if (!res.headersSent) {
        res.status(200).json({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: "Parse error",
            data: String(err?.stack ?? err),
          },
        });
      }
    }
  });
}
