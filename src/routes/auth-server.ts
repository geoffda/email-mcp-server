import { Router } from "express";
import type { Request, Response } from "express";

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

export default router;
