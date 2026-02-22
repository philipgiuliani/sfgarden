import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerGardenTools } from "../_shared/tools/gardens.ts";
import { registerPlantingTools } from "../_shared/tools/plantings.ts";
import { registerHarvestTools } from "../_shared/tools/harvests.ts";
import { registerSeedlingTools } from "../_shared/tools/seedlings.ts";
import { registerNoteTools } from "../_shared/tools/notes.ts";
import { registerDataTools } from "../_shared/tools/data.ts";

// ── Environment ─────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVER_URL =
  Deno.env.get("SERVER_URL") ?? `${SUPABASE_URL}/functions/v1/mcp`;

// ── OAuth 2.1 metadata ─────────────────────────────────────────────────────
// Our server is the issuer. The actual authorization / token endpoints
// are Supabase Auth's OAuth 2.1 server.
const oauthMetadata = {
  issuer: SERVER_URL,
  authorization_endpoint: `${SUPABASE_URL}/auth/v1/oauth/authorize`,
  token_endpoint: `${SUPABASE_URL}/auth/v1/oauth/token`,
  registration_endpoint: `${SUPABASE_URL}/auth/v1/oauth/clients/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: [
    "client_secret_basic",
    "client_secret_post",
    "none",
  ],
};

const resourceMetadataUrl = `${SERVER_URL}/.well-known/oauth-protected-resource`;

// ── CORS headers ────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, MCP-Protocol-Version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

// ── MCP server factory ─────────────────────────────────────────────────────
function createMcpServer(supabase: ReturnType<typeof createClient>) {
  const server = new McpServer(
    { name: "sfg-mcp-server", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      instructions: [
        "You are helping a user manage their square foot gardens.",
        "",
        "## Coordinate system",
        "Gardens use an alphanumeric grid: columns are letters (A, B, C, …) and rows are numbers (1, 2, 3, …).",
        'For example, "B3" means column B, row 3. A 4×4 garden spans A–D columns and 1–4 rows.',
        "",
        "## Typical workflows",
        "1. **List first.** Always call sfg_list_gardens before performing operations so you know garden IDs, dimensions, and what is already planted.",
        "2. **Planting directly.** When the user wants to plant something in a garden, use sfg_add_planting with the garden ID and one or more square coordinates.",
        "3. **Starting from seed.** When the user is starting seeds indoors, use sfg_start_seedlings (seedlings are user-level, not tied to a garden). Then advance through phases with sfg_advance_seedling_phase: sown → germinated → true_leaves → hardening → transplanted. When transplanting, first create the planting with sfg_add_planting, then advance the seedling to 'transplanted' and link it to that planting ID.",
        "4. **Harvesting.** Use sfg_record_harvest to log each harvest event. Set mark_complete to true only when the plant is fully done producing.",
        "5. **Notes.** Use sfg_add_note to record observations, tasks, plans, or issues. Link notes to a specific square or planting when relevant.",
        "",
        "## Important rules",
        "- Do not guess garden IDs or planting IDs — always retrieve them first.",
        "- A single square can have multiple plantings (e.g. succession planting), but the tool will warn about conflicts with active plantings.",
        "- Seedlings and plantings are separate concepts: seedlings track indoor growth, plantings track what is in the garden.",
        "- sfg_get_all_data returns raw JSON of all tables — use it for analytics, summaries, or when you need to cross-reference data.",
      ].join("\n"),
    },
  );

  const getClient = () => supabase;
  registerGardenTools(server, getClient);
  registerPlantingTools(server, getClient);
  registerHarvestTools(server, getClient);
  registerSeedlingTools(server, getClient);
  registerNoteTools(server, getClient);
  registerDataTools(server, getClient);

  return server;
}

// ── Consent HTML ────────────────────────────────────────────────────────────
function renderConsent(authorizationId: string, error = "") {
  return CONSENT_HTML.replace("__AUTHORIZATION_ID__", authorizationId)
    .replace("__ERROR__", error)
    .replaceAll("__SERVER_URL__", SERVER_URL);
}

// ── Hono app ────────────────────────────────────────────────────────────────
const app = new Hono().basePath("/mcp");

// CORS preflight
app.options("*", (c) => c.body(null, 204, CORS_HEADERS));

// ── OAuth discovery endpoints ───────────────────────────────────────────────
app.get("/.well-known/oauth-authorization-server", (c) =>
  c.json(oauthMetadata, 200, CORS_HEADERS),
);

app.get("/.well-known/oauth-protected-resource", (c) =>
  c.json(
    {
      resource: SERVER_URL,
      authorization_servers: [SERVER_URL],
      bearer_methods_supported: ["header"],
      resource_name: "Square Foot Garden MCP Server",
    },
    200,
    CORS_HEADERS,
  ),
);

// ── Consent flow ────────────────────────────────────────────────────────────
app.get("/consent", (c) => {
  const authId = c.req.query("authorization_id") ?? "";
  return c.html(renderConsent(authId));
});

app.post("/consent/approve", async (c) => {
  const body = await c.req.parseBody();
  const authorization_id = body.authorization_id as string;
  const email = body.email as string;
  const password = body.password as string;

  if (!authorization_id || !email || !password) {
    return c.html(
      renderConsent(authorization_id ?? "", "Missing required fields."),
    );
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: signIn, error: signInErr } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInErr || !signIn.session) {
      return c.html(
        renderConsent(
          authorization_id,
          signInErr?.message ?? "Sign in failed.",
        ),
      );
    }

    const { data: details, error: detailsErr } =
      await supabase.auth.oauth.getAuthorizationDetails(authorization_id);

    if (detailsErr) {
      return c.html(renderConsent(authorization_id, detailsErr.message));
    }

    if ((details as any)?.redirect_url) {
      return c.redirect((details as any).redirect_url);
    }

    const { data: approveData, error: approveErr } =
      await supabase.auth.oauth.approveAuthorization(authorization_id, {
        skipBrowserRedirect: true,
      });

    if (approveErr) {
      return c.html(renderConsent(authorization_id, approveErr.message));
    }

    const redirectUrl =
      (approveData as any)?.redirect_url ||
      (approveData as any)?.redirect_to;

    if (redirectUrl) {
      return c.redirect(redirectUrl);
    }
    return c.html(
      renderConsent(authorization_id, "Approved but no redirect URL."),
    );
  } catch (err: any) {
    return c.html(
      renderConsent(authorization_id, err.message ?? "Internal error."),
    );
  }
});

app.post("/consent/signup", async (c) => {
  const body = await c.req.parseBody();
  const authorization_id = body.authorization_id as string;
  const email = body.email as string;
  const password = body.password as string;

  if (!authorization_id || !email || !password) {
    return c.html(
      renderConsent(authorization_id ?? "", "Missing required fields."),
    );
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpErr) {
      return c.html(renderConsent(authorization_id, signUpErr.message));
    }

    if (!signUp.session) {
      return c.html(
        renderConsent(
          authorization_id,
          "Account created! Check your email to confirm, then sign in.",
        ),
      );
    }

    const { data: details, error: detailsErr } =
      await supabase.auth.oauth.getAuthorizationDetails(authorization_id);

    if (detailsErr) {
      return c.html(renderConsent(authorization_id, detailsErr.message));
    }

    if ((details as any)?.redirect_url) {
      return c.redirect((details as any).redirect_url);
    }

    const { data: approveData, error: approveErr } =
      await supabase.auth.oauth.approveAuthorization(authorization_id, {
        skipBrowserRedirect: true,
      });

    if (approveErr) {
      return c.html(renderConsent(authorization_id, approveErr.message));
    }

    const redirectUrl =
      (approveData as any)?.redirect_url ||
      (approveData as any)?.redirect_to;

    if (redirectUrl) {
      return c.redirect(redirectUrl);
    }
    return c.html(
      renderConsent(authorization_id, "Approved but no redirect URL."),
    );
  } catch (err: any) {
    return c.html(
      renderConsent(authorization_id, err.message ?? "Internal error."),
    );
  }
});

// ── MCP endpoint ────────────────────────────────────────────────────────────
app.post("/", async (c) => {
  // Verify Bearer token
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.text("Unauthorized", 401, {
      ...CORS_HEADERS,
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return c.text("Unauthorized", 401, {
      ...CORS_HEADERS,
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    });
  }

  // Create per-request MCP server + transport
  const server = createMcpServer(supabase);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// GET / DELETE → Method Not Allowed (MCP spec)
app.get("/", (c) =>
  c.text("Method Not Allowed", 405, { ...CORS_HEADERS, Allow: "POST" }),
);
app.delete("/", (c) =>
  c.text("Method Not Allowed", 405, { ...CORS_HEADERS, Allow: "POST" }),
);

// ── Start server ────────────────────────────────────────────────────────────
Deno.serve(app.fetch);

// ── Inline consent HTML template ────────────────────────────────────────────
const CONSENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize - Square Foot Garden</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f0;
      color: #333;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.1);
      padding: 2rem;
      max-width: 420px;
      width: 100%;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #666; margin-bottom: 1.5rem; }
    .scopes {
      background: #f9f9f6;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    .scopes h3 { font-size: 0.875rem; color: #666; margin-bottom: 0.5rem; }
    .scopes ul { list-style: none; padding: 0; }
    .scopes li { padding: 0.25rem 0; }
    .scopes li::before { content: "\\2713 "; color: #4a7c59; }
    label { display: block; margin-bottom: 0.25rem; font-size: 0.875rem; color: #555; }
    input {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 1rem;
      margin-bottom: 0.75rem;
    }
    input:focus { outline: none; border-color: #4a7c59; }
    button {
      width: 100%;
      padding: 0.75rem;
      background: #4a7c59;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .error { color: #c53030; margin-top: 1rem; font-size: 0.9rem; }
    .signup-link { text-align: center; margin-top: 0.75rem; font-size: 0.875rem; color: #666; }
    .signup-link a { color: #4a7c59; text-decoration: none; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Square Foot Garden</h1>
    <p class="subtitle">Sign in to authorize access to your garden data.</p>

    <div class="scopes">
      <h3>This will allow the application to:</h3>
      <ul>
        <li>View your gardens and plantings</li>
        <li>Add and update plantings</li>
        <li>Record harvests</li>
        <li>Manage seedlings and notes</li>
      </ul>
    </div>

    <form id="mainForm" method="POST" action="__SERVER_URL__/consent/approve">
      <input type="hidden" name="authorization_id" id="authorization_id" value="__AUTHORIZATION_ID__" />

      <div id="loginFields">
        <label for="email">Email</label>
        <input type="email" name="email" id="email" required placeholder="you@example.com" />
        <label for="password">Password</label>
        <input type="password" name="password" id="password" required placeholder="Your password" />
      </div>

      <button type="submit" id="submitBtn">Sign in &amp; Approve</button>
    </form>

    <p class="signup-link" id="signupLink">
      Don't have an account? <a onclick="toggleSignup()">Sign up</a>
    </p>

    <p class="error" id="error" style="display:none">__ERROR__</p>
  </div>

  <script>
    var serverUrl = "__SERVER_URL__";
    var errorEl = document.getElementById('error');
    if (errorEl.textContent && errorEl.textContent !== '__ERROR__') {
      errorEl.style.display = 'block';
    }

    var isSignup = false;
    function toggleSignup() {
      isSignup = !isSignup;
      var form = document.getElementById('mainForm');
      var btn = document.getElementById('submitBtn');
      var link = document.getElementById('signupLink');

      if (isSignup) {
        form.action = serverUrl + '/consent/signup';
        btn.textContent = 'Sign up & Approve';
        link.innerHTML = 'Already have an account? <a onclick="toggleSignup()">Sign in</a>';
      } else {
        form.action = serverUrl + '/consent/approve';
        btn.textContent = 'Sign in & Approve';
        link.innerHTML = "Don't have an account? " + '<a onclick="toggleSignup()">Sign up</a>';
      }
    }
  </script>
</body>
</html>`;
