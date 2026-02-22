import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateLabels } from "../utils/grid.js";

export function registerPlantingTools(
  server: McpServer,
  getClient: () => SupabaseClient,
) {
  server.tool(
    "sfg_add_planting",
    "Plant something in one or more squares of a garden. Use this both for direct planting and for placing transplanted seedlings. If a square already has an active planting, the tool will warn about the conflict but still create the new planting (for succession planting). Call sfg_list_gardens first to get the garden ID and see which squares are available.",
    {
      garden_id: z.string().describe("ID of the garden to plant in (from sfg_list_gardens)"),
      squares: z
        .array(z.string())
        .min(1)
        .describe('One or more grid coordinates, e.g. ["A1", "B2"]. Letters are columns, numbers are rows.'),
      plant_name: z.string().describe("Common name of the plant, e.g. 'Tomato', 'Basil', 'Lettuce'"),
      variety: z.string().optional().describe("Specific variety, e.g. 'Roma', 'Genovese', 'Buttercrunch'"),
      count: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of plants per square — in square foot gardening this depends on plant spacing (default 1)"),
      planted_at: z
        .string()
        .optional()
        .describe("Date the planting went into the garden (YYYY-MM-DD, defaults to today)"),
      notes: z.string().optional().describe("Freeform notes about this planting"),
    },
    async ({ garden_id, squares, plant_name, variety, count, planted_at, notes }) => {
      const supabase = getClient();

      const { data: garden, error: gardenErr } = await supabase
        .from("gardens")
        .select("cols, rows")
        .eq("id", garden_id)
        .single();

      if (gardenErr || !garden) {
        return { content: [{ type: "text", text: `Error: Garden ${garden_id} not found.` }], isError: true };
      }

      const labels = squares.map((s) => s.toUpperCase());
      try {
        validateLabels(labels, garden.cols, garden.rows);
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }

      // Check for conflicts
      const { data: existing } = await supabase
        .from("plantings")
        .select("square, plant_name")
        .eq("garden_id", garden_id)
        .eq("status", "active")
        .in("square", labels);

      const warnings: string[] = [];
      if (existing && existing.length > 0) {
        for (const e of existing) {
          warnings.push(`${e.square} already has active planting: ${e.plant_name}`);
        }
      }

      const created: string[] = [];
      for (const label of labels) {
        const { data, error } = await supabase.from("plantings").insert({
          garden_id,
          square: label,
          plant_name,
          variety: variety ?? null,
          count: count ?? 1,
          planted_at: planted_at ?? new Date().toISOString().split("T")[0],
          notes: notes ?? null,
        }).select("id").single();

        if (error) {
          return { content: [{ type: "text", text: `Error creating planting for ${label}: ${error.message}` }], isError: true };
        }
        created.push(`${data.id} (${label})`);
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
    "Change the status of an existing planting. Use 'harvested' when a plant is completely done producing, or 'failed' if it died or was removed. Prefer sfg_record_harvest with mark_complete=true over calling this directly when recording a final harvest.",
    {
      planting_id: z.string().describe("ID of the planting to update"),
      status: z.enum(["active", "harvested", "failed"]).describe("New status: 'active' (growing), 'harvested' (done producing), or 'failed' (died/removed)"),
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
            text: `Planting ${data.id} (${data.plant_name}, ${data.square}) status set to "${status}".`,
          },
        ],
      };
    },
  );
}
