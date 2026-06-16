import express from "express";
import { errorHandler } from "../middleware/error-handler.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { z } from "zod";

export function startMcpServer(app: express.Express) {
  console.log(">>> startMcpServer() executing");

  // Typed session registry
  const sessions = new Map<
    string,
    { server: McpServer; transport: StreamableHTTPServerTransport }
  >();

  function createSession(sessionId: string) {
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
    });

    void server.connect(transport);

    const session = { server, transport };
    sessions.set(sessionId, session);
    return session;
  }

  app.post("/mcp", async (req, res) => {
    try {
      const sessionId =
        req.headers["mcp-session-id"]?.toString() || randomUUID();

      let session = sessions.get(sessionId);
      if (!session) {
        session = createSession(sessionId);
      }

      await session.transport.handleRequest(req, res);
    } catch (err) {
      console.error("MCP transport error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "MCP transport failure" });
      }
    }
  });

  app.use(errorHandler);
}
