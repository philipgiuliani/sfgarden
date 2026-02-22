import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateLabels } from "../utils/grid.ts";

export function registerNoteTools(
  server: McpServer,
  getClient: () => SupabaseClient,
) {
  server.tool(
    "sfg_add_note",
    "Attach a categorized note to a garden. Use 'observation' for what you see (pests, growth, weather effects), 'task' for things to do, 'plan' for future planting ideas, 'issue' for problems needing attention, and 'general' for everything else. Optionally link a note to a specific square or planting for context.",
    {
      garden_id: z.string().describe("ID of the garden this note belongs to"),
      category: z
        .enum(["observation", "task", "plan", "issue", "general"])
        .describe("observation = what you see, task = to-do, plan = future intent, issue = problem, general = other"),
      content: z.string().describe("The note text — be as detailed as needed"),
      square: z
        .string()
        .optional()
        .describe("Optional grid coordinate to associate this note with, e.g. 'A1' or 'B3'"),
      planting_id: z.string().optional().describe("Optional planting ID to associate this note with a specific planting"),
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
          content: [{ type: "text" as const, text: `Error: Garden ${garden_id} not found.` }],
          isError: true,
        };
      }

      const label = square ? square.toUpperCase() : null;
      if (label) {
        try {
          validateLabels([label], garden.cols, garden.rows);
        } catch (e: any) {
          return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
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
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }

      let text = `Note added (${data.id}, ${category})`;
      if (label) text += ` for ${label}`;
      if (planting_id) text += ` linked to planting ${planting_id}`;
      text += ".";

      return { content: [{ type: "text" as const, text }] };
    },
  );
}
