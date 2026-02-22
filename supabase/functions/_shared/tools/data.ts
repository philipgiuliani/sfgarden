import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export function registerDataTools(
  server: McpServer,
  getClient: () => SupabaseClient,
) {
  server.tool(
    "sfg_get_all_data",
    "Export all of the user's data as raw JSON: gardens, plantings, harvests, seedlings, and notes. Use this when you need to analyze trends (e.g. total yield, planting history), answer questions that span multiple gardens, or cross-reference records. The response can be large — prefer the other tools for simple lookups.",
    {},
    async () => {
      const supabase = getClient();

      const [gardens, plantings, harvests, seedlings, notes] = await Promise.all([
        supabase.from("gardens").select("*").order("created_at", { ascending: false }),
        supabase.from("plantings").select("*").order("planted_at", { ascending: false }),
        supabase.from("harvests").select("*").order("harvested_at", { ascending: false }),
        supabase.from("seedlings").select("*").order("sown_at", { ascending: false }),
        supabase.from("notes").select("*").order("created_at", { ascending: false }),
      ]);

      const errors: string[] = [];
      if (gardens.error) errors.push(`gardens: ${gardens.error.message}`);
      if (plantings.error) errors.push(`plantings: ${plantings.error.message}`);
      if (harvests.error) errors.push(`harvests: ${harvests.error.message}`);
      if (seedlings.error) errors.push(`seedlings: ${seedlings.error.message}`);
      if (notes.error) errors.push(`notes: ${notes.error.message}`);

      if (errors.length > 0) {
        return {
          content: [{ type: "text" as const, text: `Errors fetching data:\n${errors.join("\n")}` }],
          isError: true,
        };
      }

      const data = {
        gardens: gardens.data,
        plantings: plantings.data,
        harvests: harvests.data,
        seedlings: seedlings.data,
        notes: notes.data,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
