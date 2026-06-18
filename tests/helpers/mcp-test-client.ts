/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable no-empty */
/* eslint-disable no-control-regex */
/* eslint-disable @typescript-eslint/no-floating-promises */

// tests/helpers/mcp-test-client.ts
import request from "supertest";
import type { Server } from "http";
import { startServer } from "../../src/web-server.js";

export interface McpTestClient {
  server: Server;
  init_session: () => Promise<string>;
  post_json: (body: unknown) => Promise<request.Response>;
}

export function create_mcp_test_client(): McpTestClient {
  // Start the REAL server
  const server = startServer(true);

  let session_id: string | null = null;

  async function init_session() {
    const res = await request(server)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: "0",
        method: "initialize",
        params: {
          clientInfo: { name: "mcp-test", version: "0.0.0" },
          protocolVersion: "2024-11-05",
          capabilities: {},
        },
      });

    const raw = res.headers["mcp-session-id"];
    if (Array.isArray(raw)) {
      session_id = raw[0] ?? null;
    } else if (typeof raw === "string") {
      session_id = raw;
    } else {
      session_id = null;
    }

    if (!session_id) {
      session_id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    }

    return session_id;
  }

  async function post_json(body: unknown) {
    if (!session_id) {
      await init_session();
    }

    const req = request(server)
      .post("/mcp")
      .set("mcp-protocol-version", "2024-11-05")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json text/event-stream");

    if (session_id) {
      req.set("mcp-session-id", session_id);
    }

    return req.send(body as any);
  }

  return {
    server,
    init_session,
    post_json,
  };
}
