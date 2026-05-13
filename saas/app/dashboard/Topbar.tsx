// saas/app/dashboard/Topbar.tsx

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Topbar() {
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setEmail(user.email ?? null);

        const { data } = await supabase
          .from("credits")
          .select("amount")
          .eq("user_id", user.id)
          .single();

        setCredits(data?.amount ?? 0);
      }
    };

    load();
  }, []);

  return (
    <header style={wrapper}>
      <div style={left}>
        <h2 style={title}>Dashboard</h2>
      </div>

      <div style={right}>
        <span style={creditBox}>Credits: {credits}</span>

        <div style={avatar}>
          {email ? email.charAt(0).toUpperCase() : "?"}
        </div>
      </div>
    </header>
  );
}

/* Styles */

const wrapper = {
  width: "100%",
  padding: "16px 24px",
  background: "#0b111a",
  borderBottom: "1px solid #222",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  position: "sticky" as const,
  top: 0,
  zIndex: 50,
};

const left = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const title = {
  fontSize: "22px",
  fontWeight: "bold",
  color: "#FFD700",
};

const right = {
  display: "flex",
  alignItems: "center",
  gap: "20px",
};

const creditBox = {
  padding: "6px 12px",
  background: "#1a1f29",
  borderRadius: "8px",
  border: "1px solid #333",
  fontWeight: "bold",
  color: "#FFD700",
};

const avatar = {
  width: "38px",
  height: "38px",
  borderRadius: "50%",
  background: "#FFD700",
  color: "#000",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  fontWeight: "bold",
  fontSize: "18px",
};
