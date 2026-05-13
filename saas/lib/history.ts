import { supabase } from "@/lib/supabaseClient";
import type { GenerationMode, HistoryItem } from "@/lib/types";

export async function addHistory(
  userId: string,
  mode: GenerationMode,
  prompt: string,
  output: string,
  path?: string
) {
  const { error } = await supabase.from("history").insert([
    {
      user_id: userId,
      mode,
      prompt,
      output,
      path,
    },
  ]);

  if (error) throw error;
}

export async function getHistory(userId: string): Promise<HistoryItem[]> {
  const { data, error } = await supabase
    .from("history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data as HistoryItem[];
}
