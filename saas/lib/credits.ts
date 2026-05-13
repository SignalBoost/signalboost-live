import { supabase } from "@/lib/supabaseClient";
import type { CreditRow } from "@/lib/types";

export async function getCredits(userId: string): Promise<CreditRow> {
  const { data, error } = await supabase
    .from("credits")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) throw error;

  return data as CreditRow;
}

export async function useCredits(userId: string, amount: number) {
  const { error } = await supabase.rpc("increment_credits", {
    target_user_id: userId,
    amount,
  });

  if (error) throw error;
}
