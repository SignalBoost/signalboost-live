// app/dashboard/generate/page.tsx

"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function GeneratePage() {
  const { t } = useTranslation();
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
        <h1 className="text-3xl font-bold text-gray-800">{t("generate.title", "Generate Content")}</h1>

        <textarea
          className="w-full h-40 border border-gray-300 rounded-md p-4 focus:ring-2 focus:ring-yellow-400"
          placeholder={t("generate.placeholder", "Describe what you want to generate...")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <button
          onClick={generate}
          disabled={loading}
          className="px-6 py-3 bg-yellow-400 text-black font-semibold rounded-md hover:bg-yellow-500 transition"
        >
          {loading ? t("generate.generating", "Generating…") : t("generate.generate", "Generate")}
        </button>

        {result && (
          <div className="mt-6 p-6 bg-white rounded-md shadow">
            <h2 className="text-xl font-semibold mb-2">{t("generate.result", "Result")}</h2>
            <p className="whitespace-pre-line">{result}</p>
          </div>
        )}
      </div>

      {/* Right: Brand Memory Panel */}
      <aside className="w-80 bg-white shadow p-6 rounded-md h-fit">
        <h2 className="text-xl font-bold mb-4">{t("generate.brandMemory", "Brand Memory")}</h2>

        {brandLoading && (
          <p className="text-gray-500">{t("generate.loadingBrand", "Loading brand profile…")}</p>
        )}

        {!brandLoading && !brand && (
          <p className="text-gray-500">
            {t("generate.noBrand1", "No brand profile set. Go to")}{" "}
            <strong>{t("generate.brandSettings", "Brand Settings")}</strong>{" "}
            {t("generate.noBrand2", "to configure your brand.")}
          </p>
        )}

        {!brandLoading && brand && (
          <div className="space-y-3 text-sm">
            <div>
              <strong>{t("generate.m.name", "Name")}:</strong> {brand.brand_name || "—"}
            </div>
            <div>
              <strong>{t("generate.m.tagline", "Tagline")}:</strong> {brand.brand_tagline || "—"}
            </div>
            <div>
              <strong>{t("generate.m.tone", "Tone")}:</strong> {brand.brand_tone || "—"}
            </div>
            <div>
              <strong>{t("generate.m.formality", "Formality")}:</strong> {brand.formality_level || "—"}
            </div>
            <div>
              <strong>{t("generate.m.audience", "Audience")}:</strong> {brand.primary_audience || "—"}
            </div>
            <div>
              <strong>{t("generate.m.personality", "Personality")}:</strong> {brand.brand_personality || "—"}
            </div>
            <div>
              <strong>{t("generate.m.primaryLang", "Primary Language")}:</strong> {brand.primary_language || "—"}
            </div>
            <div>
              <strong>{t("generate.m.cultural", "Cultural Notes")}:</strong> {brand.cultural_notes || "—"}
            </div>
            <div>
              <strong>{t("generate.m.colors", "Colors")}:</strong>{" "}
              {(brand.preferred_colors || []).join(", ") || "—"}
            </div>
            <div>
              <strong>{t("generate.m.layout", "Layout Style")}:</strong> {brand.layout_style || "—"}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
