import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";

const router = Router();

const SERVER_BASE = process.env.SERVER_BASE ?? "";

router.get(
  "/.well-known/oauth-authorization-server",
  (req: Request, res: Response) => {
    res.json({
      issuer: SERVER_BASE,
      authorization_endpoint: `${SERVER_BASE}/authorize`,
      token_endpoint: `${SERVER_BASE}/token`,
      jwks_uri: `${SERVER_BASE}/.well-known/jwks.json`,
      registration_endpoint: `${SERVER_BASE}/.well-known/oauth-authorization-server/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [
        "openid",
        "profile",
        "offline_access",
        process.env.MCP_SCOPE ?? "",
      ],
    });
  },
);

router.post(
  "/.well-known/oauth-authorization-server/register",
  (req: Request, res: Response) => {
    res.json({
      client_id: "mcp-inspector", // or generate a UUID if you want
      redirect_uris: [`${process.env.SERVER_BASE}/oauth/callback`],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope:
        `openid profile offline_access ${process.env.MCP_SCOPE ?? ""}`.trim(),
    });
  },
);

router.get("/authorize", (req: Request, res: Response) => {
  const { redirect_uri, state } = req.query;

  if (!redirect_uri || typeof redirect_uri !== "string") {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing redirect_uri",
    });
  }

  // Generate a fake authorization code
  const code = crypto.randomUUID();

  // Redirect back to the client
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", String(state));

  res.redirect(302, redirectUrl.toString());
});

router.post("/token", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  const grant_type = body["grant_type"];
  const code = body["code"];
  const code_verifier = body["code_verifier"];

  if (grant_type !== "authorization_code") {
    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only authorization_code is supported",
    });
  }

  if (!code) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing authorization code",
    });
  }

  if (!code_verifier) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing code_verifier",
    });
  }

  const accessToken = crypto.randomUUID();
  const refreshToken = crypto.randomUUID();

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope:
      `openid profile offline_access ${process.env.MCP_SCOPE ?? ""}`.trim(),
  });
});

export default router;
