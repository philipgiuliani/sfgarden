# SFGarden MCP Server

## Project Structure

- `supabase/functions/mcp/index.ts` — MCP server edge function (Deno + Hono)
- `supabase/migrations/` — Database schema (single source of truth)
- `.claude/skills/sfgarden/` — Claude Code skill for behavioral guidance
- `.github/workflows/deploy.yml` — CI: runs `supabase db push` + deploys edge function on push to main

## Key Concepts

- **Single tool**: `execute_sql` — runs arbitrary SQL with RLS enforced via the user's JWT
- **Dynamic schema**: The MCP server queries `information_schema` and `pg_constraint` on first request to generate schema docs. Cached in-memory per deploy. No hardcoded schema in code.
- **Skill vs MCP instructions**: The skill (`.claude/skills/sfgarden/SKILL.md`) provides behavioral guidance (emoji grids, seedling phase warnings, language). The MCP server's `instructions` provide schema, coordinate system, and SQL patterns.

## Development

```bash
supabase functions serve mcp --env-file .env
```

## Deployment

Pushes to `main` auto-deploy via GitHub Actions. Manual deploy:

```bash
supabase functions deploy mcp --project-ref <ref>
```

## Database Migrations

Add new migrations as `supabase/migrations/NNN_description.sql`. The schema will be picked up automatically by the MCP server's dynamic introspection — no need to update instructions manually.
