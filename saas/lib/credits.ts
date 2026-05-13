import { supabase } from "./supabaseClient";

// Always return a number
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
