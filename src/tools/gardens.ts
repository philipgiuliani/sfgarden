import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateId } from "../utils/ids.js";
import { colToLetter, letterToCol } from "../utils/grid.js";

export function registerGardenTools(
  server: McpServer,
  getClient: () => SupabaseClient,
) {
  server.tool(
    "sfg_list_gardens",
    "List all gardens with active plantings, harvest counts, and seedlings in progress",
    {},
    async () => {
      const supabase = getClient();

      const { data: gardens, error } = await supabase
        .from("gardens")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }

      if (!gardens || gardens.length === 0) {
        return {
          content: [{ type: "text", text: "No gardens found. Use sfg_create_garden to create one." }],
        };
      }

      const results = [];
      for (const garden of gardens) {
        const { cols, rows } = garden;

        const { data: activePlantings } = await supabase
          .from("plantings")
          .select("id, square, plant_name, variety")
          .eq("garden_id", garden.id)
          .eq("status", "active");

        const { count: harvestCount } = await supabase
          .from("harvests")
          .select("id", { count: "exact", head: true })
          .in(
            "planting_id",
            (activePlantings ?? []).map((p) => p.id),
          );

        const { data: seedlings } = await supabase
          .from("seedlings")
          .select("id, plant_name, phase")
          .eq("garden_id", garden.id)
          .not("phase", "in", '("transplanted","failed")');

        // Build grid display
        const grid: string[][] = Array.from({ length: rows }, () =>
          Array.from({ length: cols }, () => "·"),
        );

        for (const p of activePlantings ?? []) {
          const match = (p.square as string)?.match(/^([A-Z]+)(\d+)$/i);
          if (!match) continue;
          const colIdx = letterToCol(match[1]) - 1;
          const rowIdx = parseInt(match[2], 10) - 1;
          if (rowIdx >= 0 && rowIdx < rows && colIdx >= 0 && colIdx < cols) {
            grid[rowIdx][colIdx] = p.plant_name.substring(0, 3);
          }
        }

        // Column header: "     A    B    C    D"
        const colWidth = 5;
        const rowLabelWidth = 3;
        const header =
          " ".repeat(rowLabelWidth) +
          Array.from({ length: cols }, (_, i) => colToLetter(i + 1).padEnd(colWidth)).join("");

        const gridLines = grid.map((r, rowIdx) =>
          String(rowIdx + 1).padEnd(rowLabelWidth) + r.map((c) => c.padEnd(colWidth)).join(""),
        );

        const gridStr = [header, ...gridLines].join("\n");

        results.push(
          `## ${garden.name} (${garden.id})\n` +
            `Size: ${cols}x${rows} (${cols * rows} squares)\n` +
            (garden.notes ? `Notes: ${garden.notes}\n` : "") +
            `\n\`\`\`\n${gridStr}\n\`\`\`\n` +
            `Active plantings: ${activePlantings?.length ?? 0}\n` +
            `Total harvests: ${harvestCount ?? 0}\n` +
            `Seedlings in progress: ${seedlings?.length ?? 0}`,
        );
      }

      return { content: [{ type: "text", text: results.join("\n\n---\n\n") }] };
    },
  );

  server.tool(
    "sfg_create_garden",
    "Create a new square foot garden",
    {
      name: z.string().describe("Name of the garden"),
      cols: z.number().int().positive().describe("Number of columns (X axis)"),
      rows: z.number().int().positive().describe("Number of rows (Y axis)"),
      notes: z.string().optional().describe("Optional notes about the garden"),
    },
    async ({ name, cols, rows, notes }) => {
      const supabase = getClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { content: [{ type: "text", text: "Error: not authenticated" }], isError: true };
      }

      const id = await generateId(supabase, "gardens", "G");

      const { error } = await supabase.from("gardens").insert({
        id,
        user_id: user.id,
        name,
        cols,
        rows,
        notes: notes ?? null,
      });

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }

      return {
        content: [{ type: "text", text: `Garden "${name}" created (${id}, ${cols}x${rows}).` }],
      };
    },
  );
}
