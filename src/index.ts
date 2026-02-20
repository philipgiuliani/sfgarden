import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthMetadataRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { tokenVerifier, createUserSupabaseClient } from "./auth.js";
import { registerGardenTools } from "./tools/gardens.js";
import { registerPlantingTools } from "./tools/plantings.js";
import { registerHarvestTools } from "./tools/harvests.js";
import { registerSeedlingTools } from "./tools/seedlings.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerDataTools } from "./tools/data.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const SERVER_URL = process.env.SERVER_URL ?? `http://localhost:${PORT}`;
const SUPABASE_URL = process.env.SUPABASE_URL!;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build OAuth metadata — issuer is our own server so clients can discover
// the metadata at /.well-known/oauth-authorization-server on our host.
// The actual authorization/token endpoints point to Supabase's OAuth 2.1 server.
const oauthMetadata: OAuthMetadata = {
  issuer: SERVER_URL,
  authorization_endpoint: `${SUPABASE_URL}/auth/v1/oauth/authorize`,
  token_endpoint: `${SUPABASE_URL}/auth/v1/oauth/token`,
  registration_endpoint: `${SUPABASE_URL}/auth/v1/oauth/clients/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
};

const resourceServerUrl = new URL("/mcp", SERVER_URL);
const resourceMetadataUrl = `${SERVER_URL}/.well-known/oauth-protected-resource/mcp`;

// Express app
const app = express();

// Request logging
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Protected resource metadata router (serves /.well-known/oauth-protected-resource/mcp)
app.use(
  mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl,
    resourceName: "Square Foot Garden MCP Server",
  }),
);

// Consent page
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const consentTemplate = readFileSync(
  path.join(__dirname, "..", "public", "index.html"),
  "utf-8",
);

function renderConsent(authorizationId: string, error?: string) {
  return consentTemplate
    .replace("__AUTHORIZATION_ID__", authorizationId)
    .replace("__ERROR__", error ?? "");
}

app.get("/consent", (req, res) => {
  const authId = (req.query.authorization_id as string) ?? "";
  res.type("html").send(renderConsent(authId));
});
app.get("/consent/", (req, res) => {
  const authId = (req.query.authorization_id as string) ?? "";
  res.type("html").send(renderConsent(authId));
});

// Server-side consent: sign in + approve in one request
app.use("/consent", express.urlencoded({ extended: false }));

app.post("/consent/approve", async (req, res) => {
  const { authorization_id, email, password } = req.body;
  if (!authorization_id || !email || !password) {
    res.type("html").send(renderConsent(authorization_id ?? "", "Missing required fields."));
    return;
  }

  try {
    // Sign in to get user session
    const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY!);
    const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr || !signIn.session) {
      res.type("html").send(renderConsent(authorization_id, signInErr?.message ?? "Sign in failed."));
      return;
    }

    console.log("User signed in:", signIn.user?.email);

    // Bind user to the authorization (sets user_id on the authorization record)
    const { data: details, error: detailsErr } = await supabase.auth.oauth.getAuthorizationDetails(
      authorization_id,
    );

    console.log("Authorization details:", JSON.stringify({ data: details, error: detailsErr }));

    if (detailsErr) {
      res.type("html").send(renderConsent(authorization_id, detailsErr.message));
      return;
    }

    // If auto-approved (existing consent), details will have redirect_url directly
    if ((details as any)?.redirect_url) {
      res.redirect((details as any).redirect_url);
      return;
    }

    // Now approve (user_id is set, ownership check will pass)
    const { data: approveData, error: approveErr } = await supabase.auth.oauth.approveAuthorization(
      authorization_id,
      { skipBrowserRedirect: true },
    );

    console.log("Approve result:", JSON.stringify({ data: approveData, error: approveErr }));

    if (approveErr) {
      res.type("html").send(renderConsent(authorization_id, approveErr.message));
      return;
    }

    const redirectUrl = (approveData as any)?.redirect_url || (approveData as any)?.redirect_to;
    if (redirectUrl) {
      res.redirect(redirectUrl);
    } else {
      res.type("html").send(renderConsent(authorization_id, "Approved but no redirect URL. Data: " + JSON.stringify(approveData)));
    }
  } catch (err: any) {
    console.error("Consent error:", err);
    res.type("html").send(renderConsent(authorization_id, err.message ?? "Internal error."));
  }
});

app.post("/consent/signup", async (req, res) => {
  const { authorization_id, email, password } = req.body;
  if (!authorization_id || !email || !password) {
    res.type("html").send(renderConsent(authorization_id ?? "", "Missing required fields."));
    return;
  }

  try {
    const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY!);
    const { data: signUp, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) {
      res.type("html").send(renderConsent(authorization_id, signUpErr.message));
      return;
    }

    if (!signUp.session) {
      res.type("html").send(renderConsent(authorization_id, "Account created! Check your email to confirm, then sign in."));
      return;
    }

    // Bind user to the authorization (sets user_id on the authorization record)
    const { data: details, error: detailsErr } = await supabase.auth.oauth.getAuthorizationDetails(
      authorization_id,
    );

    if (detailsErr) {
      res.type("html").send(renderConsent(authorization_id, detailsErr.message));
      return;
    }

    if ((details as any)?.redirect_url) {
      res.redirect((details as any).redirect_url);
      return;
    }

    const { data: approveData, error: approveErr } = await supabase.auth.oauth.approveAuthorization(
      authorization_id,
      { skipBrowserRedirect: true },
    );

    if (approveErr) {
      res.type("html").send(renderConsent(authorization_id, approveErr.message));
      return;
    }

    const redirectUrl = (approveData as any)?.redirect_url || (approveData as any)?.redirect_to;
    if (redirectUrl) {
      res.redirect(redirectUrl);
    } else {
      res.type("html").send(renderConsent(authorization_id, "Approved but no redirect URL."));
    }
  } catch (err: any) {
    console.error("Signup consent error:", err);
    res.type("html").send(renderConsent(authorization_id, err.message ?? "Internal error."));
  }
});

// MCP endpoint with auth
app.post(
  "/mcp",
  requireBearerAuth({ verifier: tokenVerifier, resourceMetadataUrl }),
  async (req, res) => {
    try {
      const authInfo = req.auth!;
      const supabase = createUserSupabaseClient(authInfo.token);

      // Create MCP server for this request
      const server = new McpServer(
        { name: "sfg-mcp-server", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );

      const getClient = () => supabase;
      registerGardenTools(server, getClient);
      registerPlantingTools(server, getClient);
      registerHarvestTools(server, getClient);
      registerSeedlingTools(server, getClient);
      registerNoteTools(server, getClient);
      registerDataTools(server, getClient);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// Handle GET and DELETE for MCP (required by spec)
app.get(
  "/mcp",
  requireBearerAuth({ verifier: tokenVerifier, resourceMetadataUrl }),
  async (req, res) => {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  },
);

app.delete(
  "/mcp",
  requireBearerAuth({ verifier: tokenVerifier, resourceMetadataUrl }),
  async (req, res) => {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  },
);

app.listen(PORT, () => {
  console.log(`SFG MCP Server listening on ${SERVER_URL}`);
  console.log(`MCP endpoint: ${SERVER_URL}/mcp`);
  console.log(`Protected resource metadata: ${resourceMetadataUrl}`);
});
