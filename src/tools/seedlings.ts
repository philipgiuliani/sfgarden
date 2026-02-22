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
    "Record starting seeds indoors. Seedlings belong to the user, not a specific garden — they only become linked to a garden square when transplanted via sfg_advance_seedling_phase. Use this when the user is starting seeds in trays, pots, or cells before moving them outside.",
    {
      plant_name: z.string().describe("Common name of the plant, e.g. 'Tomato', 'Pepper'"),
      variety: z.string().optional().describe("Specific variety, e.g. 'San Marzano', 'Jalapeño'"),
      count: z.number().int().positive().optional().describe("Number of seeds or cells being started (default 1)"),
      sown_at: z.string().optional().describe("Date seeds were sown (YYYY-MM-DD, defaults to today)"),
      notes: z.string().optional().describe("Seed source, soil mix used, location of tray, etc."),
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
    "Move a seedling forward in its lifecycle. Phases must progress in order: sown → germinated → true_leaves → hardening → transplanted. A seedling can be marked 'failed' from any phase. When transplanting, first create the planting with sfg_add_planting, then call this tool with phase='transplanted' and pass the new planting_id to link them.",
    {
      seedling_id: z.string().describe("ID of the seedling to advance"),
      phase: z
        .enum(PHASES)
        .describe("Target phase — must be later than the current phase (or 'failed' from any phase)"),
      planting_id: z
        .string()
        .optional()
        .describe("Required when phase is 'transplanted': the planting ID (from sfg_add_planting) to link the seedling to its garden square"),
      date: z.string().optional().describe("Date the phase change occurred (YYYY-MM-DD, defaults to today)"),
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
