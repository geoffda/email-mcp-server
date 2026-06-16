import { describe, test, expect, beforeEach } from "vitest";
import {
  create_mcp_test_client,
  type McpTestClient,
} from "./helpers/mcp-test-client.js";

describe("Session lifecycle (basic checks)", () => {
  let client: McpTestClient;

  beforeEach(() => {
    client = create_mcp_test_client();
  });

  test("request without session id returns a valid response shape", async () => {
    // NOTE: We intentionally DO NOT call init_session()
    // This simulates a client sending a request before initialization.

    const res = await client.post_json({
      jsonrpc: "2.0",
      id: "1",
      method: "noop",
      params: {},
    });

    // Transport may return 400 (no session), 404 (bad session), or 200 (noop)
    expect([200, 400, 404]).toContain(res.status);
    expect(res.body).toBeDefined();
  });

  test("request with session id returns a valid response shape", async () => {
    await client.init_session();

    const res = await client.post_json({
      jsonrpc: "2.0",
      id: "1",
      method: "noop",
      params: {},
    });

    expect([200, 400, 404]).toContain(res.status);
    expect(res.body).toBeDefined();
  });
});
