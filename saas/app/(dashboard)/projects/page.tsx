"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCredits } from "@/lib/credits";

export default function ProjectsPage() {
  const [credits, setCredits] = useState<number>(0);

  useEffect(() => {
    const fetchCredits = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const creditAmount = await getCredits(user.id); // ✅ returns number
        setCredits(creditAmount);
      }
    };
    fetchCredits();
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Projects</h1>
      <div className="card">
        <h2 className="text-xl mb-4">Your Credits</h2>
        <p className="text-gray-600">Available credits: {credits}</p>
      </div>
      {/* Add your project list here */}
    </div>
  );
}
