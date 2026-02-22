import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateLabels } from "../utils/grid.js";

export function registerNoteTools(
  server: McpServer,
  getClient: () => SupabaseClient,
) {
  server.tool(
    "sfg_add_note",
    "Add a categorized note to a garden, optionally linked to a specific square or planting",
    {
      garden_id: z.string().describe("Garden ID"),
      category: z
        .enum(["observation", "task", "plan", "issue", "general"])
        .describe("Note category"),
      content: z.string().describe("Note content"),
      square: z
        .string()
        .optional()
        .describe('Optional coordinate label, e.g. "A1" or "B3" (letter column, number row)'),
      planting_id: z.string().optional().describe("Optional planting ID to link to"),
    },
    async ({ garden_id, category, content, square, planting_id }) => {
      const supabase = getClient();

      const { data: garden, error: gardenErr } = await supabase
        .from("gardens")
        .select("id, cols, rows")
        .eq("id", garden_id)
        .single();

      if (gardenErr || !garden) {
        return {
          content: [{ type: "text", text: `Error: Garden ${garden_id} not found.` }],
          isError: true,
        };
      }

      const label = square ? square.toUpperCase() : null;
      if (label) {
        try {
          validateLabels([label], garden.cols, garden.rows);
        } catch (e: any) {
          return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
        }
      }

      const { data, error } = await supabase.from("notes").insert({
        garden_id,
        category,
        content,
        square: label,
        planting_id: planting_id ?? null,
      }).select("id").single();

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }

      let text = `Note added (${data.id}, ${category})`;
      if (label) text += ` for ${label}`;
      if (planting_id) text += ` linked to planting ${planting_id}`;
      text += ".";

      return { content: [{ type: "text", text }] };
    },
  );
}
