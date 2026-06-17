/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable no-control-regex */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export const MCP_DEBUG = process.env.MCP_DEBUG === "true";

export function dbg(...args: unknown[]) {
  if (MCP_DEBUG) console.debug(...args);
}

export type McpSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

/**
 * Create a single MCP session: server + transport + tools.
 * No Express / HTTP concerns here.
 */
export function createMcpSession(
  sessionId: string,
  testMode = false,
): McpSession {
  dbg(`[mcp] creating session ${sessionId}`);

  const server = new McpServer({
    name: "email-mcp-server",
    version: "0.0.1",
  });

  /**
   * Register a tool with the SDK server.
   * We rely on the SDK to be the single source of truth for tool handlers.
   */
  function registerTool<TIn = unknown, TOut = unknown>(
    name: string,
    schema: {
      description?: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
    },
    handler: (args: TIn) => Promise<TOut> | TOut,
  ) {
    // Let the SDK own the handler. If registerTool throws, let it surface.
    server.registerTool(name, schema as any, handler as any);
  }

  // ping tool
  registerTool(
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
