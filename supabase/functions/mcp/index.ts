import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

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

// ── MCP instructions ────────────────────────────────────────────────────────
const STATIC_INSTRUCTIONS = `You are helping a user manage their square foot gardens. Always call get_schema before writing SQL queries to discover the database structure, rules, and query patterns.`;

// ── Schema introspection ────────────────────────────────────────────────────

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface ForeignKey {
  table_name: string;
  column_name: string;
  foreign_table: string;
  foreign_column: string;
}

interface CheckConstraint {
  table_name: string;
  constraint_name: string;
  definition: string;
}

const SCHEMA_TABLES = "'gardens', 'plantings', 'harvests', 'seedlings', 'notes'";

const COLUMNS_QUERY = `
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN (${SCHEMA_TABLES})
  ORDER BY table_name, ordinal_position`;

const FK_QUERY = `
  SELECT
    c.conrelid::regclass::text AS table_name,
    a.attname AS column_name,
    c.confrelid::regclass::text AS foreign_table,
    af.attname AS foreign_column
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
  WHERE c.contype = 'f'
    AND c.conrelid::regclass::text IN (${SCHEMA_TABLES})`;

const CHECK_QUERY = `
  SELECT
    c.conrelid::regclass::text AS table_name,
    c.conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  WHERE c.contype = 'c'
    AND c.conrelid::regclass::text IN (${SCHEMA_TABLES})
    AND c.conname NOT LIKE '%_not_null'`;

let cachedSchema: string | null = null;

function formatType(dataType: string): string {
  const typeMap: Record<string, string> = {
    "timestamp with time zone": "timestamptz",
  };
  return typeMap[dataType] ?? dataType;
}

function parseCheckValues(definition: string): string[] | null {
  const match = definition.match(/ANY\s*\(ARRAY\[(.*?)\]/);
  if (!match) return null;
  return match[1].split(",").map((v) => v.trim().replace(/'([^']*)'::text/g, "$1"));
}

function buildSchemaMarkdown(
  columns: ColumnInfo[],
  foreignKeys: ForeignKey[],
  checks: CheckConstraint[],
): string {
  // Index FKs by table.column
  const fkMap = new Map<string, ForeignKey>();
  for (const fk of foreignKeys) {
    fkMap.set(`${fk.table_name}.${fk.column_name}`, fk);
  }

  // Index check constraints by table.column (extract column from constraint name)
  const checkMap = new Map<string, string[]>();
  for (const ck of checks) {
    const values = parseCheckValues(ck.definition);
    if (values) {
      // Extract column name from constraint: e.g. "plantings_status_check" → "status"
      const colMatch = ck.constraint_name.match(/^[a-z]+_(.+?)_check$/);
      if (colMatch) {
        checkMap.set(`${ck.table_name}.${colMatch[1]}`, values);
      }
    }
  }

  // Group columns by table
  const tables = new Map<string, ColumnInfo[]>();
  for (const col of columns) {
    if (!tables.has(col.table_name)) tables.set(col.table_name, []);
    tables.get(col.table_name)!.push(col);
  }

  // Build markdown
  const tableOrder = ["gardens", "plantings", "harvests", "seedlings", "notes"];
  const sections: string[] = [];

  for (const tableName of tableOrder) {
    const cols = tables.get(tableName);
    if (!cols) continue;

    const rows: string[] = [];
    rows.push(`### ${tableName}`);
    rows.push("| Column | Type | Nullable | Default | Notes |");
    rows.push("|--------|------|----------|---------|-------|");

    for (const col of cols) {
      const type = formatType(col.data_type);
      const nullable = col.is_nullable === "YES" ? "yes" : "no";
      const dflt = col.column_default
        ? col.column_default
            .replace("::text", "")
            .replace("(gen_random_uuid())", "gen_random_uuid()")
        : "";

      const notes: string[] = [];
      if (col.column_name === "id") notes.push("PK");

      const fk = fkMap.get(`${tableName}.${col.column_name}`);
      if (fk) notes.push(`FK → ${fk.foreign_table}(${fk.foreign_column})`);

      const enumValues = checkMap.get(`${tableName}.${col.column_name}`);
      if (enumValues) notes.push(enumValues.map((v) => `'${v}'`).join(", "));

      // Check constraints like cols > 0
      for (const ck of checks) {
        if (ck.table_name !== tableName) continue;
        if (parseCheckValues(ck.definition)) continue; // already handled as enum
        if (ck.definition.includes(col.column_name)) {
          notes.push(ck.definition.replace(/^CHECK \(/, "").replace(/\)$/, ""));
        }
      }

      rows.push(
        `| ${col.column_name} | ${type} | ${nullable} | ${dflt} | ${notes.join("; ")} |`,
      );
    }

    sections.push(rows.join("\n"));
  }

  return sections.join("\n\n");
}

async function fetchSchemaInstructions(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  if (cachedSchema) return cachedSchema;

  const [columnsRes, fkRes, checksRes] = await Promise.all([
    supabase.rpc("execute_sql", { query: COLUMNS_QUERY }),
    supabase.rpc("execute_sql", { query: FK_QUERY }),
    supabase.rpc("execute_sql", { query: CHECK_QUERY }),
  ]);

  if (columnsRes.error || fkRes.error || checksRes.error) {
    // Fallback: return instructions without schema
    return STATIC_INSTRUCTIONS;
  }

  const schemaMarkdown = buildSchemaMarkdown(
    columnsRes.data as ColumnInfo[],
    fkRes.data as ForeignKey[],
    checksRes.data as CheckConstraint[],
  );

  cachedSchema = `## Row Level Security

All tables have RLS enabled. Queries are automatically scoped to the authenticated user — you NEVER need to filter by user_id in SELECT/UPDATE/DELETE queries. For INSERTs into tables with a \`user_id\` column (gardens, seedlings), use \`auth.uid()\`.

## Coordinate System

Gardens use an alphanumeric grid: columns are letters (A, B, C, …) and rows are numbers (1, 2, 3, …).
For example, "B3" means column B, row 3. A 4×4 garden spans columns A–D and rows 1–4.

## Writing Data (INSERT / UPDATE / DELETE)

For write operations, wrap them in a CTE so results are returned:

\`\`\`sql
WITH new_row AS (
  INSERT INTO plantings (garden_id, square, plant_name, variety, count, planted_at)
  VALUES ('...', 'A1', 'Tomato', 'Roma', 1, CURRENT_DATE)
  RETURNING *
)
SELECT * FROM new_row
\`\`\`

## Important Rules

- IDs are auto-generated UUIDs — do NOT fabricate IDs, just omit the \`id\` column on INSERT.
- Seedling phases must progress in order: sown → germinated → true_leaves → hardening → transplanted. A seedling can be marked 'failed' from any phase.
- When transplanting a seedling, first create the planting, then update the seedling's phase and planting_id.
- A single square can have multiple plantings (succession planting).
- Seedlings and plantings are separate concepts: seedlings track indoor growth, plantings track what is in the garden.
- Always use \`id\` (primary key) in WHERE clauses for UPDATE and DELETE queries — never filter by name, square, or other non-unique columns. If you don't know the ID, run a SELECT first to find the correct record, then use the returned \`id\` in your write query.

## Database Schema

${schemaMarkdown}`;
  return cachedSchema;
}

// ── MCP server factory ─────────────────────────────────────────────────────
function createMcpServer(
  supabase: ReturnType<typeof createClient>,
  instructions: string,
) {
  const server = new McpServer(
    { name: "sfg-mcp-server", version: "2.0.0" },
    {
      capabilities: { tools: {} },
      instructions,
    },
  );

  server.tool(
    "get_schema",
    "Get the database schema for the Square Foot Garden database. Call this FIRST before writing any SQL queries to discover available tables, columns, types, and constraints.",
    {},
    async () => {
      const schema = await fetchSchemaInstructions(supabase);
      return {
        content: [{ type: "text" as const, text: schema }],
      };
    },
  );

  server.tool(
    "execute_sql",
    "Execute a SQL query against the Square Foot Garden database. Returns a JSON array of rows. For writes (INSERT/UPDATE/DELETE), use a CTE with RETURNING to get results back. RLS is enforced — only the authenticated user's data is accessible. IMPORTANT: Call get_schema first if you don't know the table structure.",
    {
      query: z.string().describe("The SQL query to execute"),
    },
    async ({ query }) => {
      const { data, error } = await supabase.rpc("execute_sql", { query });

      if (error) {
        return {
          content: [{ type: "text" as const, text: `SQL error: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

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

  // Fetch schema (cached after first request) and create MCP server
  const instructions = await fetchSchemaInstructions(supabase);
  const server = createMcpServer(supabase, instructions);
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
