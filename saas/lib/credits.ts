import { useState, useEffect } from "react";
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

/**
 * React hook to automatically fetch and track credits for the current user.
 */
export function useCredits() {
  const [credits, setCredits] = useState<number>(0);

  useEffect(() => {
    const fetchCredits = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const creditAmount = await getCredits(user.id);
        setCredits(creditAmount);
      }
    };
    fetchCredits();
  }, []);

  return credits;
}
