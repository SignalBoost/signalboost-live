"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCredits } from "@/lib/credits";
import { addHistory } from "@/lib/history";

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [credits, setCredits] = useState<{ used: number; credit_limit: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCredits = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const creditData = await getCredits(user.id);
        setCredits(creditData);
      }
      setLoading(false);
    };
    fetchCredits();
  }, []);

  const handleGenerate = async () => {
    if (!credits) return;

    // Cost per video generation
    const cost = 5;

    if (credits.used + cost > credits.credit_limit) {
      setOutput("❌ Not enough credits. Please upgrade or purchase more.");
      return;
    }

    // Placeholder AI output
    const newOutput = `Generated video for: "${prompt}"`;
    setOutput(newOutput);

    // Save to history + deduct credits
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await addHistory(user.id, "video", prompt, newOutput, "/videos/path.mp4");
      await supabase.rpc("increment_credits", { target_user_id: user.id, amount: cost });
      const updatedCredits = await getCredits(user.id);
      setCredits(updatedCredits);
    }
  };

  if (loading) return <p className="text-gray-400">Loading dashboard...</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-yellow-400">AI Video Generator</h2>

      <textarea
        className="w-full h-32 p-4 bg-gray-800 text-gray-100 rounded"
        placeholder="Describe your video..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <button
        onClick={handleGenerate}
        className="bg-yellow-400 text-black px-6 py-2 rounded font-semibold"
      >
        Generate Video
      </button>

      <div className="bg-gray-800 p-6 rounded">
        <h3 className="text-xl font-semibold mb-4">Output Preview</h3>
        {output ? (
          <p className="text-gray-100">{output}</p>
        ) : (
          <p className="text-gray-400">Your generated video will appear here...</p>
        )}
      </div>

      {credits && (
        <div className="bg-gray-900 p-4 rounded">
          <p className="text-yellow-400 font-bold">
            Credits: {credits.used} / {credits.credit_limit}
          </p>
        </div>
      )}
    </div>
  );
}
