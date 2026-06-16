import { describe, test, expect } from "vitest";
import express, { type Express } from "express";
import { startMcpServer } from "../src/mcp/server.js";

describe("Server wiring", () => {
  test("startMcpServer attaches handlers without throwing", () => {
    const testApp: Express = express();
    expect(() => startMcpServer(testApp)).not.toThrow();
  });
});
