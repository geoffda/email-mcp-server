// tests/mcp/mcp-raw-body.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import {
  create_mcp_test_client,
  type McpTestClient,
} from "./helpers/mcp-test-client.js";

describe("MCP raw body handling", () => {
  let client: McpTestClient;

  beforeEach(() => {
    client = create_mcp_test_client();
  });

  test("valid JSON-RPC request succeeds when global JSON parser is enabled", async () => {
    await client.init_session();

    const res = await client.post_json({
      jsonrpc: "2.0",
      id: "1",
      method: "tools.call",
      params: {
        name: "ping",
        arguments: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    const body = res.body as { result?: unknown; error?: unknown };
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
  });

  test("invalid JSON produces a clean parse error (400)", async () => {
    await client.init_session();

    const res = await client.post_json("this is not json");

    expect(res.status).toBe(400);
    expect(res.body).toBeDefined();
    const body = res.body as { error?: unknown };
    expect(body.error).toBeDefined();
  });
});
