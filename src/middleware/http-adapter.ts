/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable no-control-regex */

import type { Request, Response, NextFunction, Express } from "express";
import type { IncomingMessage } from "http";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  createMcpSession,
  MCP_DEBUG,
  dbg,
  type McpSession,
} from "../mcp/server.js";

type Session = McpSession;
const sessions = new Map<string, Session>();

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
  } catch (e) {
    dbg("[mcp] bodyToBufferIfNeeded stringify failed:", e);
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

function bufferToRequestLike(
  buf: Buffer,
  originalReq: Request,
): IncomingMessage & { [k: string]: unknown } {
  const stream = new Readable({
    read() {
      this.push(buf);
      this.push(null);
    },
  }) as any;

  stream.method = originalReq.method ?? "POST";
  stream.url = originalReq.url ?? "/mcp";
  stream.socket = (originalReq as any).socket ?? {};
  stream.connection = (originalReq as any).connection ?? stream.socket;
  stream.httpVersion = (originalReq as any).httpVersion ?? "1.1";
  stream.httpVersionMajor = (originalReq as any).httpVersionMajor ?? 1;
  stream.httpVersionMinor = (originalReq as any).httpVersionMinor ?? 1;

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

  if (!normalized["content-type"]) {
    normalized["content-type"] = "application/json";
  }

  normalized["content-length"] = String(buf.length);
  stream.headers = normalized;

  if (
    Array.isArray((originalReq as any).rawHeaders) &&
    (originalReq as any).rawHeaders.length > 0
  ) {
    stream.rawHeaders = (originalReq as any).rawHeaders.slice();
  } else {
    const rawArr: string[] = [];
    for (const k of Object.keys(normalized)) {
      rawArr.push(k);
      rawArr.push(normalized[k]);
    }
    stream.rawHeaders = rawArr;
  }

  stream.trailers = (originalReq as any).trailers ?? {};
  stream.rawTrailers = Array.isArray((originalReq as any).rawTrailers)
    ? (originalReq as any).rawTrailers.slice()
    : [];

  stream.complete = true;

  return stream as IncomingMessage & { [k: string]: unknown };
}

/**
 * Capture outgoing response body and headers for debugging.
 * IMPORTANT: do not return the raw results of originalWrite/originalEnd (they are `any`).
 */
function captureResponseForLogging(res: any): () => void {
  const chunks: Buffer[] = [];
  const originalWrite = res.write;
  const originalEnd = res.end;
  const originalSetHeader = res.setHeader?.bind?.(res);

  const headers: Record<string, string> = {};
  if (originalSetHeader) {
    res.setHeader = (name: string, value: any) => {
      try {
        headers[String(name).toLowerCase()] = String(value);
      } catch (e) {
        dbg("[mcp] setHeader stringify failed:", e);
        headers[String(name).toLowerCase()] = "";
      }
      // call original and do not return its (any) result
      originalSetHeader(name, value);
      return;
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
    } catch (e) {
      dbg("[mcp] capture write error:", e);
    }
    // call original and do not return its (any) result
    originalWrite.apply(res, [chunk, ...args]);
    return;
  };

  res.end = function (chunk: any, ...args: any[]) {
    try {
      if (chunk) {
        if (Buffer.isBuffer(chunk)) chunks.push(chunk);
        else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
        else if (Array.isArray(chunk)) chunks.push(Buffer.from(chunk));
        else chunks.push(Buffer.from(String(chunk)));
      }
    } catch (e) {
      dbg("[mcp] capture end error:", e);
    }
    const bodyBuf = chunks.length ? Buffer.concat(chunks) : Buffer.from("");
    const body = bodyBuf.toString("utf8");
    try {
      dbg("[mcp] outgoing response headers:", headers);
      dbg("[mcp] outgoing response body preview:", body.slice(0, 8192));
    } catch (e) {
      dbg("[mcp] outgoing response (could not stringify):", e);
    }
    // call original and do not return its (any) result
    originalEnd.apply(res, [chunk, ...args]);
    return;
  };

  return () => {
    res.write = originalWrite;
    res.end = originalEnd;
    if (originalSetHeader) res.setHeader = originalSetHeader;
  };
}

export function createMcpMiddleware(testMode = false) {
  return async function mcpMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const sessionId = req.headers["mcp-session-id"]?.toString() || randomUUID();

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

    let parsedBody: any | undefined;
    try {
      if (rawBuffer && rawBuffer.length > 0) {
        parsedBody = JSON.parse(rawBuffer.toString("utf8"));
      }
    } catch (e) {
      dbg("[mcp] failed to parse JSON body:", e);
      parsedBody = undefined;
    }

    const methodName = parsedBody?.method;
    dbg(`[mcp] incoming request session=${sessionId} method=${methodName}`);

    const restoreCapture = MCP_DEBUG
      ? captureResponseForLogging(res)
      : () => {};

    try {
      let session = sessions.get(sessionId);
      if (!session) {
        session = createMcpSession(sessionId, testMode);
        sessions.set(sessionId, session);
      }

      if (
        parsedBody &&
        parsedBody.jsonrpc === "2.0" &&
        parsedBody.method === "tools.call"
      ) {
        const id = parsedBody.id ?? null;
        const params = parsedBody.params ?? {};
        const toolName = params?.name;
        const toolArgs = params?.arguments ?? {};

        if (!toolName) {
          const errObj = makeJsonRpcError(
            id,
            -32602,
            "Invalid params: missing tool name",
          );
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
        } catch (invokeErr: unknown) {
          console.error(
            "[mcp] tool invocation threw:",
            (invokeErr as any)?.message ?? String(invokeErr),
          );
          console.error((invokeErr as any)?.stack ?? "");
          const errObj = makeJsonRpcError(
            id,
            -32000,
            (invokeErr as any)?.message ?? "Tool invocation failed",
          );
          res.status(200).json(errObj);
          restoreCapture();
          return;
        }
      }

      if (rawBuffer) {
        const reqLike = bufferToRequestLike(rawBuffer, req);

        try {
          const inspectHeaders = (h: any) => {
            const out: Record<string, string> = {};
            for (const k of Object.keys(h || {})) {
              const v = h[k];
              out[String(k).toLowerCase()] = Array.isArray(v)
                ? `ARRAY(${v.length})`
                : String(v);
            }
            return out;
          };

          dbg("[mcp-debug] about to call transport.handleRequest");
          dbg(
            "[mcp-debug] reqLike.method:",
            reqLike.method,
            "type:",
            typeof reqLike.method,
          );
          dbg(
            "[mcp-debug] reqLike.url:",
            reqLike.url,
            "type:",
            typeof reqLike.url,
            "length:",
            (reqLike.url && (reqLike.url as any).length) ?? "n/a",
          );
          dbg(
            "[mcp-debug] reqLike.httpVersion:",
            reqLike.httpVersion,
            "major/minor:",
            reqLike.httpVersionMajor,
            reqLike.httpVersionMinor,
          );
          dbg(
            "[mcp-debug] reqLike.headers preview:",
            inspectHeaders(reqLike.headers),
          );
          dbg(
            "[mcp-debug] reqLike.rawHeaders preview:",
            Array.isArray(reqLike.rawHeaders)
              ? reqLike.rawHeaders.slice(0, 20)
              : reqLike.rawHeaders,
          );
          dbg(
            "[mcp-debug] rawBuffer length:",
            rawBuffer ? rawBuffer.length : "no-buffer",
          );
          if (reqLike.socket) {
            dbg(
              "[mcp-debug] socket keys:",
              Object.keys(reqLike.socket).slice(0, 10),
            );
            dbg(
              "[mcp-debug] socket.remoteAddress:",
              (reqLike.socket as any).remoteAddress,
            );
          }
        } catch (e) {
          dbg("[mcp-debug] failed to inspect reqLike:", e);
        }

        try {
          await session.transport.handleRequest(reqLike as any, res as any);
        } catch (err: unknown) {
          console.error(
            "[mcp] transport.handleRequest threw:",
            (err as any)?.message ?? String(err),
          );
          console.error((err as any)?.stack ?? "");
          if (!res.headersSent) {
            res.status(200).json({
              jsonrpc: "2.0",
              id: null,
              error: {
                code: -32700,
                message: "Parse error",
                data: String((err as any)?.stack ?? err),
              },
            });
          }
        } finally {
          restoreCapture();
        }
        return;
      }

      try {
        await session.transport.handleRequest(req as any, res as any);
      } catch (err: unknown) {
        console.error(
          "[mcp] transport.handleRequest threw:",
          (err as any)?.message ?? String(err),
        );
        console.error((err as any)?.stack ?? "");
        if (!res.headersSent) {
          res.status(200).json({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32700,
              message: "Parse error",
              data: String((err as any)?.stack ?? err),
            },
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

export function startMcpServer(app: Express, testMode = false) {
  const middleware = createMcpMiddleware(testMode);
  app.post("/mcp", middleware);
}

export const createMcpServer = createMcpMiddleware;
