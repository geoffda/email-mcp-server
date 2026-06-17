import { describe, test, expect } from "vitest";
import express, { type Express } from "express";
import { startMcpServer } from "../src/mcp/server.js";

describe("Server wiring", () => {
  test("startMcpServer attaches handlers without throwing", () => {
    const testApp: Express = express();

    // Define a typed wrapper so ESLint doesn't infer `error` type
    const start = () => {
      startMcpServer(testApp);
    };

    expect(start).not.toThrow();
  });
});
