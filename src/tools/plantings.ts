import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateId } from "../utils/ids.js";
import { validateSquares, totalSquares } from "../utils/grid.js";

export function registerPlantingTools(
  server: McpServer,
  getClient: () => SupabaseClient,
) {
  server.tool(
    "sfg_add_planting",
    "Add planting(s) to square(s) in a garden. Warns about conflicts with existing active plantings.",
    {
      garden_id: z.string().describe("Garden ID"),
      squares: z
        .array(z.number().int().positive())
        .min(1)
        .describe("Square numbers to plant in"),
      plant_name: z.string().describe("Name of the plant"),
      variety: z.string().optional().describe("Plant variety"),
      count: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of plants per square (default 1)"),
      planted_at: z
        .string()
        .optional()
        .describe("Planting date (YYYY-MM-DD, default today)"),
      notes: z.string().optional().describe("Optional notes"),
    },
    async ({ garden_id, squares, plant_name, variety, count, planted_at, notes }) => {
      const supabase = getClient();

      // Get garden to validate squares
      const { data: garden, error: gardenErr } = await supabase
        .from("gardens")
        .select("size")
        .eq("id", garden_id)
        .single();

      if (gardenErr || !garden) {
        return { content: [{ type: "text", text: `Error: Garden ${garden_id} not found.` }], isError: true };
      }

      try {
        validateSquares(squares, garden.size);
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }

      // Check for conflicts
      const { data: existing } = await supabase
        .from("plantings")
        .select("square, plant_name")
        .eq("garden_id", garden_id)
        .eq("status", "active")
        .in("square", squares);

      const warnings: string[] = [];
      if (existing && existing.length > 0) {
        for (const e of existing) {
          warnings.push(
            `Square ${e.square} already has active planting: ${e.plant_name}`,
          );
        }
      }

      // Create plantings
      const created: string[] = [];
      for (const sq of squares) {
        const id = await generateId(supabase, "plantings", "P");
        const { error } = await supabase.from("plantings").insert({
          id,
          garden_id,
          square: sq,
          plant_name,
          variety: variety ?? null,
          count: count ?? 1,
          planted_at: planted_at ?? new Date().toISOString().split("T")[0],
          notes: notes ?? null,
        });

        if (error) {
          return { content: [{ type: "text", text: `Error creating planting for square ${sq}: ${error.message}` }], isError: true };
        }
        created.push(`${id} (square ${sq})`);
      }

      let text = `Created ${created.length} planting(s) of ${plant_name}:\n${created.join("\n")}`;
      if (warnings.length > 0) {
        text += `\n\nWarnings:\n${warnings.join("\n")}`;
      }

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "sfg_update_planting_status",
    "Update the status of a planting to active, harvested, or failed",
    {
      planting_id: z.string().describe("Planting ID"),
      status: z.enum(["active", "harvested", "failed"]).describe("New status"),
    },
    async ({ planting_id, status }) => {
      const supabase = getClient();

      const { data, error } = await supabase
        .from("plantings")
        .update({ status })
        .eq("id", planting_id)
        .select("id, plant_name, square")
        .single();

      if (error || !data) {
        return {
          content: [{ type: "text", text: `Error: ${error?.message ?? "Planting not found."}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Planting ${data.id} (${data.plant_name}, square ${data.square}) status set to "${status}".`,
          },
        ],
      };
    },
  );
}
