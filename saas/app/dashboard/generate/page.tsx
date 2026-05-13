// saas/app/dashboard/generate/page.tsx

"use client";

import { useState, useEffect } from "react";

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const [brand, setBrand] = useState<any>(null);
  const [brandLoading, setBrandLoading] = useState(true);

  // Load brand memory
  useEffect(() => {
    async function loadBrand() {
      const res = await fetch("/api/brand-profile");
      const data = await res.json();
      setBrand(data.profile || null);
      setBrandLoading(false);
    }
    loadBrand();
  }, []);

  async function generate() {
    setLoading(true);
    setResult("");

    const res = await fetch("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        mode: "default",
        language: brand?.primary_language || "en",
      }),
    });

    const data = await res.json();
    setResult(data.result);
    setLoading(false);
  }

  return (
    <div className="flex gap-8">
      {/* Left: Generator */}
      <div className="flex-1 space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">Generate Content</h1>

        <textarea
          className="w-full h-40 border border-gray-300 rounded-md p-4 focus:ring-2 focus:ring-yellow-400"
          placeholder="Describe what you want to generate..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <button
          onClick={generate}
          disabled={loading}
          className="px-6 py-3 bg-yellow-400 text-black font-semibold rounded-md hover:bg-yellow-500 transition"
        >
          {loading ? "Generating…" : "Generate"}
        </button>

        {/* ⭐ Editable Result + Behavioral Memory */}
        {result && (
          <div className="mt-6 p-6 bg-white rounded-md shadow space-y-4">
            <h2 className="text-xl font-semibold">Result</h2>

            <textarea
              className="w-full h-48 border border-gray-300 rounded-md p-4"
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />

            <button
              onClick={async () => {
                await fetch("/api/behavioral-memory", {
                  method: "POST",
                  body: JSON.stringify({
                    original: prompt,
                    edited: result,
                  }),
                });
                alert("Your edits were learned by the AI!");
              }}
              className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition"
            >
              Save My Edits (Teach AI)
            </button>
          </div>
        )}
      </div>

      {/* Right: Brand Memory Panel */}
      <aside className="w-80 bg-white shadow p-6 rounded-md h-fit">
        <h2 className="text-xl font-bold mb-4">Brand Memory</h2>

        {brandLoading && (
          <p className="text-gray-500">Loading brand profile…</p>
        )}

        {!brandLoading && !brand && (
          <p className="text-gray-500">
            No brand profile set.  
            Go to <strong>Brand Settings</strong> to configure your brand.
          </p>
        )}

        {!brandLoading && brand && (
          <div className="space-y-3 text-sm">
            <div>
              <strong>Name:</strong> {brand.brand_name || "—"}
            </div>
            <div>
              <strong>Tagline:</strong> {brand.brand_tagline || "—"}
            </div>
            <div>
              <strong>Tone:</strong> {brand.brand_tone || "—"}
            </div>
            <div>
              <strong>Formality:</strong> {brand.formality_level || "—"}
            </div>
            <div>
              <strong>Audience:</strong> {brand.primary_audience || "—"}
            </div>
            <div>
              <strong>Personality:</strong> {brand.brand_personality || "—"}
            </div>
            <div>
              <strong>Primary Language:</strong> {brand.primary_language || "—"}
            </div>
            <div>
              <strong>Cultural Notes:</strong> {brand.cultural_notes || "—"}
            </div>
            <div>
              <strong>Colors:</strong>{" "}
              {(brand.preferred_colors || []).join(", ") || "—"}
            </div>
            <div>
              <strong>Layout Style:</strong> {brand.layout_style || "—"}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
