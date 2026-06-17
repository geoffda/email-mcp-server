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
  toolsMap: Map<string, (args: unknown) => Promise<unknown> | unknown>;
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

  const toolsMap = new Map<
    string,
    (args: unknown) => Promise<unknown> | unknown
  >();

  function registerTool<TIn = unknown, TOut = unknown>(
    name: string,
    schema: {
      description?: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
    },
    handler: (args: TIn) => Promise<TOut> | TOut,
  ) {
    try {
      server.registerTool(name, schema as any, handler as any);
    } catch (err) {
      dbg(`[mcp] warning: server.registerTool threw for ${name}:`, err);
    }
    toolsMap.set(name, handler as any);
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

  // Best-effort tools.call adapter on the SDK
  try {
    const maybeSetHandler = (server as any).setRequestHandler;
    if (typeof maybeSetHandler === "function") {
      (server as any).setRequestHandler(
        "tools.call",
        (params: any): Promise<unknown> => {
          const name = params?.name;
          const args = params?.arguments ?? {};
          if (!name) {
            return Promise.reject(new Error("Missing tool name"));
          }
          if (typeof (server as any).callTool === "function") {
            try {
              const r = (server as any).callTool(name, args);
              return Promise.resolve(r);
            } catch (e) {
              return Promise.reject(e);
            }
          }
          const local = toolsMap.get(name);
          if (!local) {
            return Promise.reject(new Error(`tool ${name} not found`));
          }
          try {
            const maybe = local(args);
            return Promise.resolve(maybe);
          } catch (e) {
            return Promise.reject(e);
          }
        },
      );
      dbg(
        `[mcp] registered defensive "tools.call" handler for session ${sessionId}`,
      );
    } else {
      dbg(
        `[mcp] setRequestHandler not available on McpServer; skipping tools.call adapter`,
      );
    }
  } catch (err) {
    dbg(`[mcp] error while registering tools.call adapter:`, err);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
    enableJsonResponse: testMode,
  });

  void server.connect(transport);

  dbg(
    `[mcp] session ${sessionId} registered tools:`,
    Array.from(toolsMap.keys()),
  );

  return { server, transport, toolsMap };
}
