/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable no-control-regex */


// src/mcp/server.ts
import type { Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { z } from "zod";
import { Readable } from "stream";

// enable verbose MCP debug logs when MCP_DEBUG=true
const MCP_DEBUG = process.env.MCP_DEBUG === "true";

function dbg(...args: unknown[]) {
  if (MCP_DEBUG) console.debug(...args);
}


/**
 * Robust MCP middleware factory
 *
 * - Works whether or not a body parser has already consumed the request stream.
 * - Reconstructs raw bytes from req.body when needed.
 * - Pre-handles JSON-RPC "tools.call" using a local toolsMap for deterministic tests.
 * - Otherwise recreates a readable request-like stream and calls transport.handleRequest.
 * - Captures outgoing responses and logs them (headers + body preview) for debugging.
 * - Emits diagnostic [mcp-debug] logs immediately before calling transport.handleRequest.
 *
 * NOTE: This file is intentionally defensive about the shape of the request-like object
 * passed to the SDK transport. It normalizes headers, ensures content-length and
 * content-type exist, and provides rawHeaders/rawTrailers/trailers/complete fields
 * that some HTTP parsers or SDKs may inspect.
 */

export function createMcpMiddleware(testMode = false) {
  type Session = {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
    toolsMap: Map<string, (args: unknown) => Promise<unknown> | unknown>;
  };

  const sessions = new Map<string, Session>();

  function createSession(sessionId: string) {
    dbg(`[mcp] creating session ${sessionId}`);

    const server = new McpServer({
      name: "email-mcp-server",
      version: "0.0.1",
    });

    const toolsMap = new Map<string, (args: unknown) => Promise<unknown> | unknown>();

    function registerTool<TIn = unknown, TOut = unknown>(
      name: string,
      schema: { description?: string; inputSchema?: unknown; outputSchema?: unknown },
      handler: (args: TIn) => Promise<TOut> | TOut,
    ) {
      try {
        server.registerTool(name, schema as any, handler as any);
      } catch (err) {
        dbg(`[mcp] warning: server.registerTool threw for ${name}:`, err);
      }
      toolsMap.set(name, handler as any);
    }

    // Register ping tool
    registerTool(
      "ping",
      {
        description: "Simple health check tool",
        inputSchema: z.object({}),
        outputSchema: z.object({
          ok: z.boolean(),
          timestamp: z.number(),
        }),
      },
      () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              timestamp: Date.now(),
            }),
          },
        ],
        structuredContent: {
          ok: true,
          timestamp: Date.now(),
        },
      }),
    );

    // Best-effort: register a tools.call handler on the SDK if supported
    try {
      const maybeSetHandler = (server as any).setRequestHandler;
      if (typeof maybeSetHandler === "function") {
        (server as any).setRequestHandler("tools.call", async (params: any) => {
          const name = params?.name;
          const args = params?.arguments ?? {};
          if (!name) throw new Error("Missing tool name");
          if (typeof (server as any).callTool === "function") {
            return (server as any).callTool(name, args);
          }
          const local = toolsMap.get(name);
          if (!local) throw new Error(`tool ${name} not found`);
          return local(args);
        });
        dbg(`[mcp] registered defensive "tools.call" handler for session ${sessionId}`);
      } else {
        dbg(`[mcp] setRequestHandler not available on McpServer; skipping tools.call adapter`);
      }
    } catch (err) {
      dbg(`[mcp] error while registering tools.call adapter:`, err);
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      enableJsonResponse: testMode,
    });

    void server.connect(transport);

    dbg(`[mcp] session ${sessionId} registered tools:`, Array.from(toolsMap.keys()));

    const session: Session = { server, transport, toolsMap };
    sessions.set(sessionId, session);
    return session;
  }

  // Helpers

  function makeJsonRpcError(id: unknown, code: number, message: string) {
    return {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message },
    };
  }

  async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", (err) => reject(err));
    });
  }

  function bodyToBufferIfNeeded(req: Request): Buffer | undefined {
    const b = (req as any).body;
    if (b === undefined || b === null) return undefined;
    if (Buffer.isBuffer(b)) return b;
    if (typeof b === "string") return Buffer.from(b, "utf8");
    try {
      return Buffer.from(JSON.stringify(b), "utf8");
    } catch {
      return undefined;
    }
  }

  function previewBuffer(buf?: Buffer) {
    if (!buf) return "<no-buffer>";
    const preview = buf.toString("utf8", 0, Math.min(buf.length, 2048));
    return preview.replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => {
      const code = c.charCodeAt(0).toString(16).padStart(2, "0");
      return `\\x${code}`;
    });
  }

  /**
   * Build a request-like readable stream from a Buffer and the original request.
   * Defensive: normalizes headers to strings, lowercases keys, ensures content-type and content-length exist,
   * provides rawHeaders/rawTrailers/trailers/complete fields, and supplies minimal socket metadata.
   */
  function bufferToRequestLike(buf: Buffer, originalReq: Request): NodeJS.ReadableStream & any {
    const stream = new Readable({
      read() {
        this.push(buf);
        this.push(null);
      },
    }) as any;

    // Basic metadata
    stream.method = originalReq.method ?? "POST";
    stream.url = originalReq.url ?? "/mcp";
    stream.socket = (originalReq as any).socket ?? {};
    stream.connection = (originalReq as any).connection ?? stream.socket;
    stream.httpVersion = (originalReq as any).httpVersion ?? "1.1";
    stream.httpVersionMajor = (originalReq as any).httpVersionMajor ?? 1;
    stream.httpVersionMinor = (originalReq as any).httpVersionMinor ?? 1;

    // Normalize headers: ensure keys are lower-case and values are strings (not arrays or undefined)
    const rawHeaders = originalReq.headers || {};
    const normalized: Record<string, string> = {};
    for (const key of Object.keys(rawHeaders)) {
      const val = (rawHeaders as any)[key];
      if (val === undefined || val === null) continue;
      const v = Array.isArray(val) ? val[0] : val;
      try {
        normalized[String(key).toLowerCase()] = String(v);
      } catch {
        normalized[String(key).toLowerCase()] = "";
      }
    }

    // Ensure content-type exists
    if (!normalized["content-type"]) {
      normalized["content-type"] = "application/json";
    }

    // Ensure content-length matches the buffer
    normalized["content-length"] = String(buf.length);

    stream.headers = normalized;

    // Provide rawHeaders array (name, value, name, value...) which some parsers expect
    if (Array.isArray((originalReq as any).rawHeaders) && (originalReq as any).rawHeaders.length > 0) {
      stream.rawHeaders = (originalReq as any).rawHeaders.slice();
    } else {
      const rawArr: string[] = [];
      for (const k of Object.keys(normalized)) {
        rawArr.push(k);
        rawArr.push(normalized[k]);
      }
      stream.rawHeaders = rawArr;
    }

    // Provide trailers and rawTrailers (empty by default)
    stream.trailers = (originalReq as any).trailers ?? {};
    stream.rawTrailers = Array.isArray((originalReq as any).rawTrailers) ? (originalReq as any).rawTrailers.slice() : [];

    // Mark as complete (we've already read the buffer)
    stream.complete = true;

    return stream;
  }

  // Capture outgoing response body and headers for debugging (decodes buffers correctly)
  function captureResponseForLogging(res: any) {
    const chunks: Buffer[] = [];
    const originalWrite = res.write;
    const originalEnd = res.end;
    const originalSetHeader = res.setHeader?.bind?.(res);

    const headers: Record<string, string> = {};
    if (originalSetHeader) {
      res.setHeader = (name: string, value: any) => {
        try {
          headers[String(name).toLowerCase()] = String(value);
        } catch {
          headers[String(name).toLowerCase()] = "";
        }
        return originalSetHeader(name, value);
      };
    }

    res.write = function (chunk: any, ...args: any[]) {
      try {
        if (chunk) {
          if (Buffer.isBuffer(chunk)) chunks.push(chunk);
          else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
          else if (Array.isArray(chunk)) chunks.push(Buffer.from(chunk));
          else chunks.push(Buffer.from(String(chunk)));
        }
      } catch {}
      return originalWrite.apply(res, [chunk, ...args]);
    };

    res.end = function (chunk: any, ...args: any[]) {
      try {
        if (chunk) {
          if (Buffer.isBuffer(chunk)) chunks.push(chunk);
          else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
          else if (Array.isArray(chunk)) chunks.push(Buffer.from(chunk));
          else chunks.push(Buffer.from(String(chunk)));
        }
      } catch {}
      const bodyBuf = chunks.length ? Buffer.concat(chunks) : Buffer.from("");
      const body = bodyBuf.toString("utf8");
      try {
        dbg("[mcp] outgoing response headers:", headers);
        dbg("[mcp] outgoing response body preview:", body.slice(0, 8192));
      } catch (e) {
        dbg("[mcp] outgoing response (could not stringify):", e);
      }
      return originalEnd.apply(res, [chunk, ...args]);
    };

    return () => {
      res.write = originalWrite;
      res.end = originalEnd;
      if (originalSetHeader) res.setHeader = originalSetHeader;
    };
  }

  // Middleware
  return async function mcpMiddleware(req: Request, res: Response, next: NextFunction) {
    const sessionId = req.headers["mcp-session-id"]?.toString() || randomUUID();

    // Obtain rawBuffer in order of preference:
    // 1) req.rawBody if present and Buffer
    // 2) reconstruct from req.body if a body parser already ran
    // 3) read the incoming stream (consumes it)
    let rawBuffer: Buffer | undefined;
    try {
      if ((req as any).rawBody && Buffer.isBuffer((req as any).rawBody)) {
        rawBuffer = (req as any).rawBody;
      } else {
        rawBuffer = bodyToBufferIfNeeded(req);
      }

      if (!rawBuffer) {
        rawBuffer = await streamToBuffer(req as any);
      }
    } catch (err) {
      dbg("[mcp] error while obtaining raw buffer:", err);
    }

    dbg("[mcp] raw headers:", req.headers);
    dbg("[mcp] raw payload preview:", previewBuffer(rawBuffer));

    // Try to parse JSON-RPC from rawBuffer (best-effort)
    let parsedBody: any | undefined;
    try {
      if (rawBuffer && rawBuffer.length > 0) {
        parsedBody = JSON.parse(rawBuffer.toString("utf8"));
      }
    } catch {
      parsedBody = undefined;
    }

    const methodName = parsedBody?.method;
    dbg(`[mcp] incoming request session=${sessionId} method=${methodName}`);

    // Install response capture for debugging outgoing responses
    const restoreCapture = MCP_DEBUG ? captureResponseForLogging(res) : () => {};

    try {
      let session = sessions.get(sessionId);
      if (!session) {
        session = createSession(sessionId);
      }

      // Pre-handle JSON-RPC tools.call using local toolsMap if possible
      if (parsedBody && parsedBody.jsonrpc === "2.0" && parsedBody.method === "tools.call") {
        const id = parsedBody.id ?? null;
        const params = parsedBody.params ?? {};
        const toolName = params?.name;
        const toolArgs = params?.arguments ?? {};

        if (!toolName) {
          const errObj = makeJsonRpcError(id, -32602, "Invalid params: missing tool name");
          res.status(200).json(errObj);
          restoreCapture();
          return;
        }

        const toolHandler = session.toolsMap.get(toolName);
        if (!toolHandler) {
          const errObj = makeJsonRpcError(id, -32601, "Method not found");
          res.status(200).json(errObj);
          restoreCapture();
          return;
        }

        try {
          const result = await Promise.resolve(toolHandler(toolArgs));
          const response = {
            jsonrpc: "2.0",
            id,
            result,
          };
          res.status(200).json(response);
          restoreCapture();
          return;
        } catch (invokeErr: any) {
          console.error("[mcp] tool invocation threw:", invokeErr?.message);
          console.error(invokeErr?.stack);
          const errObj = makeJsonRpcError(id, -32000, invokeErr?.message ?? "Tool invocation failed");
          res.status(200).json(errObj);
          restoreCapture();
          return;
        }
      }

      // Not pre-handled: pass to transport. If we consumed the stream, recreate a readable request-like object.
      if (rawBuffer) {
        const reqLike = bufferToRequestLike(rawBuffer, req);

        // Diagnostic inspection: log the exact shape the transport will receive
        try {
          const inspectHeaders = (h: any) => {
            const out: Record<string, string> = {};
            for (const k of Object.keys(h || {})) {
              const v = (h as any)[k];
              out[String(k).toLowerCase()] = Array.isArray(v) ? `ARRAY(${v.length})` : String(v);
            }
            return out;
          };

          dbg("[mcp-debug] about to call transport.handleRequest");
          dbg("[mcp-debug] reqLike.method:", reqLike.method, "type:", typeof reqLike.method);
          dbg("[mcp-debug] reqLike.url:", reqLike.url, "type:", typeof reqLike.url, "length:", (reqLike.url && (reqLike.url as any).length) ?? "n/a");
          dbg("[mcp-debug] reqLike.httpVersion:", reqLike.httpVersion, "major/minor:", reqLike.httpVersionMajor, reqLike.httpVersionMinor);
          dbg("[mcp-debug] reqLike.headers preview:", inspectHeaders(reqLike.headers));
          dbg("[mcp-debug] reqLike.rawHeaders preview:", Array.isArray(reqLike.rawHeaders) ? reqLike.rawHeaders.slice(0, 20) : reqLike.rawHeaders);
          dbg("[mcp-debug] rawBuffer length:", rawBuffer ? rawBuffer.length : "no-buffer");
          if (reqLike.socket) {
            dbg("[mcp-debug] socket keys:", Object.keys(reqLike.socket).slice(0, 10));
            dbg("[mcp-debug] socket.remoteAddress:", (reqLike.socket as any).remoteAddress);
          }
        } catch (e) {
          dbg("[mcp-debug] failed to inspect reqLike:", e);
        }

        try {
          await session.transport.handleRequest(reqLike as any, res as any);
        } catch (err: any) {
          // Log full stack and return JSON-RPC parse error with stack in data for debugging
          console.error("[mcp] transport.handleRequest threw:", err?.message);
          console.error(err?.stack);
          if (!res.headersSent) {
            res.status(200).json({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error", data: String(err?.stack ?? err) },
            });
          }
        } finally {
          restoreCapture();
        }
        return;
      }

      // Otherwise pass original req through (also log diagnostic shape)
      try {
        try {
          dbg("[mcp-debug] about to call transport.handleRequest (original req)");
          dbg("[mcp-debug] req.method:", req.method, "url:", req.url, "headers preview:", Object.keys(req.headers).slice(0, 20));
          dbg("[mcp-debug] req.socket keys:", Object.keys((req as any).socket || {}).slice(0, 10));
        } catch {}
        await session.transport.handleRequest(req as any, res as any);
      } catch (err: any) {
        console.error("[mcp] transport.handleRequest threw:", err?.message);
        console.error(err?.stack);
        if (!res.headersSent) {
          res.status(200).json({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error", data: String(err?.stack ?? err) },
          });
        }
      } finally {
        restoreCapture();
      }
    } catch (err) {
      console.error("MCP transport error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "MCP transport failure" });
        restoreCapture();
        return;
      }
      restoreCapture();
      next(err);
    }
  };
}

/**
 * Compatibility wrapper for existing callers/tests that expect startMcpServer(app, testMode?)
 */
export function startMcpServer(app: { post: (path: string, handler: any) => void }, testMode = false) {
  const middleware = createMcpMiddleware(testMode);
  app.post("/mcp", middleware);
}

/**
 * Alias
 */
export const createMcpServer = createMcpMiddleware;
