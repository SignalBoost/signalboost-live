"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { getCredits } from "../lib/credits";

export default function Topbar() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(0);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // ✅ Normalize undefined to null
        setUserEmail(user.email ?? null);

        // ✅ Handle both number and object return types
        const creditData = await getCredits(user.id);
        if (typeof creditData === "number") {
          setCredits(creditData);
        } else if ("credits" in creditData) {
          setCredits(creditData.credits);
        } else if ("amount" in creditData) {
          setCredits(creditData.amount);
        }
      }
    };
    fetchUser();
  }, []);

  return (
    <header className="flex justify-between items-center bg-white shadow px-6 py-4 mb-6 rounded-lg">
      <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>
      <div className="flex items-center space-x-6">
        <span className="text-sm font-semibold text-yellow-600">
          Credits: {credits}
        </span>
        <span className="text-sm text-gray-600">
          {userEmail ?? "Not signed in"}
        </span>
      </div>
    </header>
  );
}
