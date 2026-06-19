import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const tenant = process.env.ENTRA_TENANT_ID;
const audience = "api://634ad41e-1ea7-4f73-ae6f-affda75b373f";
const requiredScope = "access_as_user";

if (!tenant) {
  throw new Error("ENTRA_TENANT_ID must be set");
}

const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
const jwksUri = `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`;

const JWKS = createRemoteJWKSet(new URL(jwksUri));

export async function requireEntraAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "missing_bearer_token" });
    }

    const token = auth.substring("Bearer ".length);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
      audience,
    });

    const scopes =
      typeof payload.scp === "string" ? payload.scp.split(" ") : [];

    if (!scopes.includes(requiredScope)) {
      return res.status(403).json({ error: "insufficient_scope" });
    }

    req.user = payload as Record<string, unknown>;

    next();
  } catch (err) {
    console.error("JWT validation error:", err);
    return res.status(401).json({ error: "invalid_token" });
  }
}
