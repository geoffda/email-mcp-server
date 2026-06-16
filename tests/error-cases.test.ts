import { describe, test, expect, beforeEach } from "vitest";
import {
  create_mcp_test_client,
  type McpTestClient,
} from "./helpers/mcp-test-client.js";

describe("MCP error handling", () => {
  let client: McpTestClient;

  beforeEach(() => {
    client = create_mcp_test_client();
  });

  test("invalid JSON produces a clean error", async () => {
    await client.init_session();

    const res = await client.post_json("this is not valid json");

    expect(res.status).toBe(400);
    expect(res.body).toBeDefined();
    const body = res.body as { error?: unknown };
    expect(body.error).toBeDefined();
  });

  test("unknown tool returns an MCP error object", async () => {
    await client.init_session();

    const res = await client.post_json({
      jsonrpc: "2.0",
      id: "1",
      method: "tools.call",
      params: {
        name: "does-not-exist",
        arguments: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    const body = res.body as { error?: unknown };
    expect(body.error).toBeDefined();
  });
});
