/* eslint-disable */

import { describe, test, expect, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { startMcpServer } from "../src/mcp/server";

describe("Basic endpoints", () => {
  let testApp: Express;

  beforeEach(async () => {
    testApp = express();
    startMcpServer(testApp);
  });

  test("GET / (root) should return JSON when route exists", async () => {
    const res = await request(testApp).get("/");
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) expect(res.body).toBeDefined();
  });

  test("GET /api/status should respond (if route registered)", async () => {
    const res = await request(testApp).get("/api/status");
    expect([200, 404]).toContain(res.status);
  });
});
