import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export function registerHarvestTools(
  server: McpServer,
  getClient: () => SupabaseClient,
) {
  server.tool(
    "sfg_record_harvest",
    "Log a harvest event for a planting. A single planting can have many harvests over time (e.g. picking tomatoes weekly). Set mark_complete to true only when the plant is fully done producing and the square is ready to be replanted.",
    {
      planting_id: z.string().describe("ID of the planting being harvested"),
      amount: z.string().optional().describe("Human-readable description of the yield, e.g. '6 tomatoes', '2 lbs', '1 large zucchini'"),
      weight_grams: z.number().optional().describe("Weight of the harvest in grams, for tracking total yield over time"),
      harvested_at: z
        .string()
        .optional()
        .describe("Date of the harvest (YYYY-MM-DD, defaults to today)"),
      notes: z.string().optional().describe("Observations about quality, ripeness, pest damage, etc."),
      mark_complete: z
        .boolean()
        .optional()
        .describe("If true, also sets the planting status to 'harvested' (defaults to false — use for the final harvest only)"),
    },
    async ({ planting_id, amount, weight_grams, harvested_at, notes, mark_complete }) => {
      const supabase = getClient();

      // Verify planting exists
      const { data: planting, error: plantingErr } = await supabase
        .from("plantings")
        .select("id, plant_name, square")
        .eq("id", planting_id)
        .single();

      if (plantingErr || !planting) {
        return {
          content: [{ type: "text", text: `Error: Planting ${planting_id} not found.` }],
          isError: true,
        };
      }

      const { data, error } = await supabase.from("harvests").insert({
        planting_id,
        harvested_at: harvested_at ?? new Date().toISOString().split("T")[0],
        amount: amount ?? null,
        weight_grams: weight_grams ?? null,
        notes: notes ?? null,
      }).select("id").single();

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }

      let text = `Harvest recorded (${data.id}) for ${planting.plant_name} (square ${planting.square}).`;

      if (mark_complete) {
        const { error: updateErr } = await supabase
          .from("plantings")
          .update({ status: "harvested" })
          .eq("id", planting_id);

        if (updateErr) {
          text += `\nWarning: Failed to update planting status: ${updateErr.message}`;
        } else {
          text += "\nPlanting marked as harvested.";
        }
      }

      return { content: [{ type: "text", text }] };
    },
  );
}
