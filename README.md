# SFG MCP Server

A Model Context Protocol (MCP) server for managing Square Foot Gardens. Connects to Supabase for database storage and authentication, enabling multi-user access with data isolation via Row Level Security.

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

## Supabase Setup

1. **Create a new Supabase project** at [supabase.com](https://supabase.com)

2. **Run the database migration**:
   - Go to the SQL Editor in your Supabase dashboard
   - Paste and execute the contents of `supabase/migrations/001_initial_schema.sql`

3. **Enable OAuth 2.1 server** in Authentication > Settings:
   - Enable the OAuth 2.1 provider
   - Set the authorization path to your deployed server's consent page (e.g., `https://your-server.com/consent`)

4. **Switch to asymmetric JWT signing (RS256)**:
   - Go to Authentication > Settings > JWT
   - Switch from HS256 to RS256
   - Note the JWKS URL (typically `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`)

5. **Configure site URL**:
   - Set the site URL to your deployed server URL

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJ...` |
| `SUPABASE_JWKS_URL` | JWKS endpoint for JWT verification | `https://xxx.supabase.co/auth/v1/.well-known/jwks.json` |
| `SERVER_URL` | Public URL of this server | `https://your-server.com` |
| `PORT` | Port to listen on (default: 3000) | `3000` |

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your Supabase credentials

# Build
npm run build

# Start
npm start

# Or watch for changes
npm run dev
```

## Deployment

Build and deploy as any Node.js application. Ensure all environment variables are set.

```bash
npm run build
npm start
```

## MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sfgarden": {
      "url": "https://your-server.com/mcp"
    }
  }
}
```

### Claude Code

```bash
claude mcp add sfgarden --transport http https://your-server.com/mcp
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
