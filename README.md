# SFG MCP Server

A Model Context Protocol (MCP) server for managing Square Foot Gardens. Connects to Supabase for database storage and authentication, enabling multi-user access with data isolation via Row Level Security.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A [Supabase](https://supabase.com) project

## Supabase Setup

1. **Create a new Supabase project** at [supabase.com](https://supabase.com)

2. **Link and push the database schema**:
   - `supabase link --project-ref <your-project-ref>`
   - `supabase db push`

3. **Enable OAuth 2.1 server** in Authentication > Settings:
   - Enable the OAuth 2.1 provider
   - Set the authorization path to your deployed consent page (for this repo, `docs/consent/index.html`, e.g. `https://<your-gh-pages-host>/sfgarden/consent/`)

4. **Configure site URL**:
   - Set the site URL to your deployed consent page origin (or your app origin if you have one)

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJ...` |
| `SERVER_URL` | Optional public URL of the MCP edge function (defaults to `<SUPABASE_URL>/functions/v1/mcp`) | `https://xxx.supabase.co/functions/v1/mcp` |

## Local Development

```bash
# Create .env file
cp .env.example .env
# Edit .env with your Supabase credentials, then serve the edge function locally
supabase functions serve mcp --env-file .env
```

## Deployment

Deploy the MCP server as a Supabase Edge Function:

```bash
supabase functions deploy mcp --project-ref <your-project-ref>
```

JWT verification is disabled for this function via `supabase/config.toml` (`[functions.mcp] verify_jwt = false`), so you don't need `--no-verify-jwt` on every command.

This repository's GitHub Actions workflow (`.github/workflows/deploy.yml`) already runs `supabase db push` and deploys the `mcp` function on pushes to `main`.

## MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sfgarden": {
      "url": "https://<project-ref>.supabase.co/functions/v1/mcp"
    }
  }
}
```

### Claude Code

```bash
claude mcp add sfgarden --transport http https://<project-ref>.supabase.co/functions/v1/mcp
```

The client will automatically discover the OAuth flow via the protected resource metadata endpoint and prompt you to authenticate.

## Available Tools

| Tool | Description |
|------|-------------|
| `sfg_list_gardens` | List all gardens with grid visualization, active plantings, and stats |
| `sfg_create_garden` | Create a new square foot garden |
| `sfg_add_planting` | Add planting(s) to square(s) with conflict detection |
| `sfg_update_planting_status` | Update planting status (active/harvested/failed) |
| `sfg_record_harvest` | Record a harvest with optional planting completion |
| `sfg_start_seedlings` | Start a new seedling tray |
| `sfg_advance_seedling_phase` | Advance seedling through lifecycle phases |
| `sfg_add_note` | Add a categorized note to a garden/square/planting |
| `sfg_get_all_data` | Export all raw data for analytics |
