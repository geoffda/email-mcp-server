import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const SERVER_BASE = process.env.SERVER_BASE ?? "";
const MCP_SCOPE = process.env.MCP_SCOPE ?? "";

router.get(
  "/.well-known/oauth-protected-resource",
  (req: Request, res: Response) => {
    res.json({
      issuer: SERVER_BASE,
      resource: `${SERVER_BASE}/mcp`,
      authorization_server: `${SERVER_BASE}/.well-known/oauth-authorization-server`,
      scopes_supported: ["openid", "profile", "offline_access", MCP_SCOPE],
    });
  },
);

export default router;
