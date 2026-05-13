import { supabase } from "./supabaseClient";

/**
 * Fetch credits for a given user ID.
 * Always returns a number.
 */
export async function getCredits(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("credits")
    .select("amount")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    console.error("Error fetching credits:", error);
    return 0;
  }

  return data.amount as number;
}
