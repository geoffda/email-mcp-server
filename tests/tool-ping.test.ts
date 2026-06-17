import { describe, test, expect, beforeEach } from "vitest";
import {
  create_mcp_test_client,
  type McpTestClient,
} from "./helpers/mcp-test-client.js";

interface PingStructuredContent {
  ok: boolean;
  timestamp: number;
}

interface PingContentItem {
  type: string;
  text: string;
}

interface PingResult {
  content?: PingContentItem[];
  structuredContent?: PingStructuredContent;
}

interface PingResponse {
  result?: PingResult;
  error?: unknown;
}

describe("MCP ping tool", () => {
  let client: McpTestClient;

  beforeEach(() => {
    client = create_mcp_test_client();
  });

  test("ping tool returns ok:true and a timestamp", async () => {
    await client.init_session();

    const res = await client.post_json({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        name: "ping",
        arguments: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();

    const body = res.body as PingResponse;

    // No error
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();

    // Structured content
    const structured = body.result?.structuredContent;
    expect(structured).toBeDefined();
    expect(structured?.ok).toBe(true);
    expect(typeof structured?.timestamp).toBe("number");

    // Text content
    const content = body.result?.content;
    expect(Array.isArray(content)).toBe(true);
    expect(content?.[0]?.type).toBe("text");

    const parsed = JSON.parse(content?.[0]?.text ?? "{}") as {
      ok: boolean;
      timestamp: number;
    };

    expect(parsed.ok).toBe(true);
    expect(typeof parsed.timestamp).toBe("number");
  });
});
