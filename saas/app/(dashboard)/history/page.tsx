"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getHistory } from "@/lib/history";
import type { HistoryItem } from "@/lib/types";

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const items = await getHistory(user.id);
        setHistory(items);
      }

      setLoading(false);
    };

    fetchHistory();
  }, []);

  if (loading) {
    return <p className="text-gray-400">Loading history...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-yellow-400">History</h1>
        <p className="mt-2 text-gray-400">
          Review your previous generations.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#111722]/80 p-6 text-gray-400">
          No history yet.
        </div>
      ) : (
        <ul className="space-y-4">
          {history.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-white/10 bg-[#111722]/80 p-5"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span className="rounded-full bg-yellow-400/10 px-3 py-1 font-bold uppercase text-yellow-400">
                  {item.mode}
                </span>
                <span>{new Date(item.created_at).toLocaleString()}</span>
              </div>

              <p className="font-semibold text-white">{item.prompt}</p>
              <p className="mt-2 text-gray-300">{item.output}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
