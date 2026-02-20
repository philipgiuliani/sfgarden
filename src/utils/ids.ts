import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generates an ID in format XYYYYMMDD-NNN where X is a prefix character.
 * Queries the given table for existing IDs with today's date prefix and increments.
 */
export async function generateId(
  supabase: SupabaseClient,
  table: string,
  prefix: string,
): Promise<string> {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, "0") +
    today.getDate().toString().padStart(2, "0");

  const datePrefix = `${prefix}${dateStr}-`;

  const { data } = await supabase
    .from(table)
    .select("id")
    .like("id", `${datePrefix}%`)
    .order("id", { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const lastId = data[0].id as string;
    const lastSeq = parseInt(lastId.split("-").pop()!, 10);
    seq = lastSeq + 1;
  }

  return `${datePrefix}${seq.toString().padStart(3, "0")}`;
}
