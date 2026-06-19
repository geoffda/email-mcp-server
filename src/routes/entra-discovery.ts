import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

/**
 * Entra-backed OAuth 2.0 Authorization Server Discovery
 *
 * This route advertises Microsoft Entra as the authorization server
 * for the MCP client. It replaces the local OAuth server discovery
 * document we previously implemented.
 *
 * Required environment variables:
 * - ENTRA_TENANT_ID: Azure AD tenant GUID
 * - ENTRA_API_SCOPE: e.g. api://<your-api-app-id>/access_as_user
 */
router.get(
  "/.well-known/oauth-authorization-server",
  (req: Request, res: Response) => {
    const tenant = process.env.ENTRA_TENANT_ID;
    const apiScope = process.env.ENTRA_API_SCOPE;

    if (!tenant || !apiScope) {
      return res.status(500).json({
        error: "server_misconfiguration",
        error_description:
          "ENTRA_TENANT_ID and ENTRA_API_SCOPE must be set in environment variables",
      });
    }

    res.json({
      issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
      authorization_endpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      token_endpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      jwks_uri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      scopes_supported: ["openid", "profile", "offline_access", apiScope],
    });
  },
);

export default router;
