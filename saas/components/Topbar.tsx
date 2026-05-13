"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCredits } from "@/lib/credits";

export default function Topbar() {
  const [credits, setCredits] = useState<{ used: number; credit_limit: number } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email);
        const creditData = await getCredits(user.id);
        setCredits(creditData);
      }
    };
    fetchData();
  }, []);

  return (
    <header className="flex justify-between items-center bg-white shadow px-6 py-4 mb-6">
      <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>
      <div className="flex items-center space-x-6">
        {credits && (
          <span className="text-sm font-semibold text-yellow-600">
            Credits: {credits.used} / {credits.credit_limit}
          </span>
        )}
        {userEmail && (
          <span className="text-sm text-gray-600">{userEmail}</span>
        )}
      </div>
    </header>
  );
}
