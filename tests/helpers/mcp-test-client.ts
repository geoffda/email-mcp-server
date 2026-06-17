/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable no-empty */
/* eslint-disable no-control-regex */
/* eslint-disable @typescript-eslint/no-floating-promises */ // minimal: silence floating-promise lint for test setup

// tests/helpers/mcp-test-client.ts
import request from "supertest";
import express, { type Express } from "express";
import { startMcpServer } from "../../src/mcp/server.js";

export interface McpTestClient {
  app: Express;
  init_session: () => Promise<string>;
  post_json: (body: unknown) => Promise<request.Response>;
}

export function create_mcp_test_client(): McpTestClient {
  const app: Express = express();
  // explicit call; lint rule suppressed above for test helper
  startMcpServer(app, true); // testMode = true → JSON responses

  let session_id: string | null = null;

  async function init_session() {
    const res = await request(app)
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

    // Normalize header value (could be string | string[] | undefined)
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

    const req = request(app)
      .post("/mcp")
      .set("mcp-protocol-version", "2024-11-05")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json text/event-stream");

    if (session_id !== undefined && session_id !== null) {
      req.set("mcp-session-id", String(session_id));
    }

    return req.send(body as any);
  }

  return {
    app,
    init_session,
    post_json,
  };
}
