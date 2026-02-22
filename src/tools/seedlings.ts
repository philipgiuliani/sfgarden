import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const PHASES = ["sown", "germinated", "true_leaves", "hardening", "transplanted", "failed"] as const;

export function registerSeedlingTools(
  server: McpServer,
  getClient: () => SupabaseClient,
) {
  server.tool(
    "sfg_start_seedlings",
    "Start a new seedling tray (not tied to a specific garden — seedlings live in trays until transplanted)",
    {
      plant_name: z.string().describe("Name of the plant"),
      variety: z.string().optional().describe("Plant variety"),
      count: z.number().int().positive().optional().describe("Number of seeds/cells (default 1)"),
      sown_at: z.string().optional().describe("Sowing date (YYYY-MM-DD, default today)"),
      notes: z.string().optional().describe("Optional notes"),
    },
    async ({ plant_name, variety, count, sown_at, notes }) => {
      const supabase = getClient();

      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        return { content: [{ type: "text", text: "Error: Could not resolve current user." }], isError: true };
      }

      const date = sown_at ?? new Date().toISOString().split("T")[0];

      const { data, error } = await supabase.from("seedlings").insert({
        user_id: user.id,
        plant_name,
        variety: variety ?? null,
        count: count ?? 1,
        sown_at: date,
        phase_changed_at: date,
        notes: notes ?? null,
      }).select("id").single();

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }

      return {
        content: [
          {
            type: "text",
            text: `Seedling tray started (${data.id}): ${count ?? 1}x ${plant_name}${variety ? ` (${variety})` : ""}, sown ${date}.`,
          },
        ],
      };
    },
  );

  server.tool(
    "sfg_advance_seedling_phase",
    "Advance a seedling to the next lifecycle phase: sown → germinated → true_leaves → hardening → transplanted. Or mark as failed.",
    {
      seedling_id: z.string().describe("Seedling ID"),
      phase: z
        .enum(PHASES)
        .describe("Target phase"),
      planting_id: z
        .string()
        .optional()
        .describe("If transplanting, the planting ID to link to"),
      date: z.string().optional().describe("Phase change date (YYYY-MM-DD, default today)"),
    },
    async ({ seedling_id, phase, planting_id, date }) => {
      const supabase = getClient();

      const { data: seedling, error: fetchErr } = await supabase
        .from("seedlings")
        .select("*")
        .eq("id", seedling_id)
        .single();

      if (fetchErr || !seedling) {
        return {
          content: [{ type: "text", text: `Error: Seedling ${seedling_id} not found.` }],
          isError: true,
        };
      }

      // Validate phase progression (allow setting to failed from any phase)
      if (phase !== "failed") {
        const currentIdx = PHASES.indexOf(seedling.phase);
        const targetIdx = PHASES.indexOf(phase);
        if (targetIdx <= currentIdx) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Cannot move from "${seedling.phase}" to "${phase}". Current phase is already at or past target.`,
              },
            ],
            isError: true,
          };
        }
      }

      const update: Record<string, unknown> = {
        phase,
        phase_changed_at: date ?? new Date().toISOString().split("T")[0],
      };

      if (phase === "transplanted" && planting_id) {
        update.planting_id = planting_id;
      }

      const { error } = await supabase
        .from("seedlings")
        .update(update)
        .eq("id", seedling_id);

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }

      let text = `Seedling ${seedling_id} (${seedling.plant_name}) advanced to "${phase}".`;
      if (phase === "transplanted" && planting_id) {
        text += ` Linked to planting ${planting_id}.`;
      }

      return { content: [{ type: "text", text }] };
    },
  );
}
