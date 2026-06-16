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

    session_id = res.headers["mcp-session-id"];
    return session_id;
  }

  async function post_json(body: unknown) {
    if (!session_id) {
      await init_session();
    }

    return request(app)
      .post("/mcp")
      .set("mcp-session-id", session_id!)
      .set("mcp-protocol-version", "2024-11-05")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json text/event-stream")
      .send(JSON.stringify(body));
  }

  return {
    app,
    init_session,
    post_json,
  };
}
