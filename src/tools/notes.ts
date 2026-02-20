import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateId } from "../utils/ids.js";

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
      square: z.number().int().positive().optional().describe("Optional square number"),
      planting_id: z.string().optional().describe("Optional planting ID to link to"),
    },
    async ({ garden_id, category, content, square, planting_id }) => {
      const supabase = getClient();

      // Verify garden exists
      const { data: garden, error: gardenErr } = await supabase
        .from("gardens")
        .select("id")
        .eq("id", garden_id)
        .single();

      if (gardenErr || !garden) {
        return {
          content: [{ type: "text", text: `Error: Garden ${garden_id} not found.` }],
          isError: true,
        };
      }

      const id = await generateId(supabase, "notes", "N");

      const { error } = await supabase.from("notes").insert({
        id,
        garden_id,
        category,
        content,
        square: square ?? null,
        planting_id: planting_id ?? null,
      });

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }

      let text = `Note added (${id}, ${category})`;
      if (square) text += ` for square ${square}`;
      if (planting_id) text += ` linked to planting ${planting_id}`;
      text += ".";

      return { content: [{ type: "text", text }] };
    },
  );
}
