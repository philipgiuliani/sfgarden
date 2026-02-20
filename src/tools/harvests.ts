import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateId } from "../utils/ids.js";

export function registerHarvestTools(
  server: McpServer,
  getClient: () => SupabaseClient,
) {
  server.tool(
    "sfg_record_harvest",
    "Record a harvest for a planting, optionally marking the planting as fully harvested",
    {
      planting_id: z.string().describe("Planting ID"),
      amount: z.string().optional().describe('Amount harvested (e.g. "6 tomatoes", "2 lbs")'),
      weight_grams: z.number().optional().describe("Weight in grams"),
      harvested_at: z
        .string()
        .optional()
        .describe("Harvest date (YYYY-MM-DD, default today)"),
      notes: z.string().optional().describe("Optional notes"),
      mark_complete: z
        .boolean()
        .optional()
        .describe("Set planting status to 'harvested' (default false)"),
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

      const id = await generateId(supabase, "harvests", "H");

      const { error } = await supabase.from("harvests").insert({
        id,
        planting_id,
        harvested_at: harvested_at ?? new Date().toISOString().split("T")[0],
        amount: amount ?? null,
        weight_grams: weight_grams ?? null,
        notes: notes ?? null,
      });

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }

      let text = `Harvest recorded (${id}) for ${planting.plant_name} (square ${planting.square}).`;

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
