"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { addHistory } from "@/lib/history";
import { getCredits, useCredits } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/constants";
import type { CreditRow, GenerationMode } from "@/lib/types";

const MODES: GenerationMode[] = ["text", "audio", "video", "translate", "visual"];

export default function ProjectsPage() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<GenerationMode>("text");
  const [output, setOutput] = useState("");
  const [credits, setCredits] = useState<CreditRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCredits = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const creditData = await getCredits(user.id);
      setCredits(creditData);
    };

    fetchCredits();
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setOutput("Please enter a prompt first.");
      return;
    }

    if (!credits) {
      setOutput("Credits are still loading. Try again.");
      return;
    }

    const cost = CREDIT_COSTS[mode];

    if (credits.used + cost > credits.credit_limit) {
      setOutput("❌ Not enough credits. Please upgrade or purchase more.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setOutput("You must be logged in.");
        return;
      }

      const newOutput = `Generated ${mode} content for: "${prompt}"`;

      await addHistory(user.id, mode, prompt, newOutput);
      await useCredits(user.id, cost);

      const updatedCredits = await getCredits(user.id);

      setOutput(newOutput);
      setCredits(updatedCredits);
    } catch (error) {
      console.error(error);
      setOutput("Something went wrong while generating.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl border border-white/10 bg-[#111722]/80 p-6">
        <h1 className="text-3xl font-black text-yellow-400">Create Project</h1>
        <p className="mt-2 text-sm text-gray-400">
          Generate text, audio, video, translations, or visuals from one prompt.
        </p>

        <textarea
          className="mt-6 h-40 w-full rounded-2xl border border-white/10 bg-gray-950 p-4 text-gray-100 outline-none focus:border-yellow-400"
          placeholder="Paste a review, promo idea, campaign brief, or content request..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <div className="mt-4 flex flex-wrap gap-3">
          {MODES.map((item) => (
            <button
              key={item}
              onClick={() => setMode(item)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                mode === item
                  ? "bg-yellow-400 text-black"
                  : "bg-gray-800 text-gray-200 hover:bg-gray-700"
              }`}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-6 rounded-full bg-yellow-400 px-6 py-3 font-black text-black transition hover:bg-yellow-300 disabled:opacity-60"
        >
          {loading ? "Generating..." : `Generate • ${CREDIT_COSTS[mode]} credit(s)`}
        </button>

        {credits && (
          <p className="mt-4 text-sm text-gray-400">
            Credits used:{" "}
            <span className="font-bold text-yellow-400">
              {credits.used} / {credits.credit_limit}
            </span>
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#111722]/80 p-6">
        <h2 className="text-xl font-bold text-white">Output Preview</h2>

        <div className="mt-4 min-h-60 rounded-2xl border border-white/10 bg-gray-950 p-5">
          {output ? (
            <p className="whitespace-pre-wrap text-gray-100">{output}</p>
          ) : (
            <p className="text-gray-500">
              Your generated content will appear here.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
