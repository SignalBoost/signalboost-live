"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Topbar() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(0);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? null);
        // Fetch credits from the server-side API route.
        // The service-role key stays on the server and never reaches the browser.
        try {
          const res = await fetch("/api/credits");
          const data = await res.json();
          setCredits(typeof data.credits === "number" ? data.credits : 0);
        } catch {
          setCredits(0);
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
