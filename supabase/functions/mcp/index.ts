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

// ── Hono app ────────────────────────────────────────────────────────────────
const app = new Hono().basePath("/mcp");

// CORS preflight
app.options("*", (c) => c.body(null, 204, CORS_HEADERS));

// ── Resource metadata ───────────────────────────────────────────────────────
app.get("/.well-known/oauth-protected-resource", (c) =>
  c.json(
    {
      resource: SERVER_URL,
      authorization_servers: [
        `${SUPABASE_URL}/auth/v1`,
      ],
      bearer_methods_supported: ["header"],
      resource_name: "Square Foot Garden MCP Server",
    },
    200,
    CORS_HEADERS,
  ),
);

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
  } = await supabase.auth.getUser(token);

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
