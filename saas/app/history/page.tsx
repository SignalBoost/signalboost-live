// saas/app/history/page.tsx

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface HistoryItem {
  id: string;
  prompt: string;
  result: string;
  mode: string;
  created_at: string;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("generations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setItems(data || []);
      setLoading(false);
    };

    load();
  }, []);

  return (
    <div style={wrapper}>
      <h1 style={title}>History</h1>

      {loading ? (
        <p style={loadingText}>Loading...</p>
      ) : items.length === 0 ? (
        <p style={empty}>No history yet.</p>
      ) : (
        <div style={list}>
          {items.map((item) => (
            <div key={item.id} style={card}>
              <div style={header}>
                <span style={mode}>{item.mode}</span>
                <span style={date}>
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>

              <p style={prompt}>{item.prompt}</p>
              <p style={output}>{item.result}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Styles */

const wrapper = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "20px",
  padding: "20px",
};

const title = {
  fontSize: "28px",
  fontWeight: "bold",
  color: "#FFD700",
};

const loadingText = {
  color: "#aaa",
};

const empty = {
  color: "#777",
  fontSize: "16px",
};

const list = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "20px",
};

const card = {
  background: "#0f141c",
  padding: "20px",
  borderRadius: "12px",
  border: "1px solid #222",
  display: "flex",
  flexDirection: "column" as const,
  gap: "10px",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const mode = {
  background: "#FFD700",
  color: "#000",
  padding: "4px 10px",
  borderRadius: "6px",
  fontWeight: "bold",
  fontSize: "12px",
};

const date = {
  color: "#888",
  fontSize: "12px",
};

const prompt = {
  fontWeight: "bold",
  color: "#fff",
};

const output = {
  color: "#ccc",
  whiteSpace: "pre-wrap" as const,
};
