// saas/app/dashboard/generate/page.tsx

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
        <h1 className="text-3xl font-bold text-gray-800">{t("generate.title")}</h1>

        <textarea
          className="w-full h-40 border border-gray-300 rounded-md p-4 focus:ring-2 focus:ring-yellow-400"
          placeholder={t("generate.placeholder")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <button
          onClick={generate}
          disabled={loading}
          className="px-6 py-3 bg-yellow-400 text-black font-semibold rounded-md hover:bg-yellow-500 transition"
        >
          {loading ? t("generate.generating") : t("generate.button")}
        </button>

        {result && (
          <div className="mt-6 p-6 bg-white rounded-md shadow">
            <h2 className="text-xl font-semibold mb-2">{t("generate.result")}</h2>
            <p className="whitespace-pre-line">{result}</p>
          </div>
        )}
      </div>

      <aside className="w-80 bg-white shadow p-6 rounded-md h-fit">
        <h2 className="text-xl font-bold mb-4">{t("brand.memory")}</h2>

        {brandLoading && (
          <p className="text-gray-500">{t("brand.loading")}</p>
        )}

        {!brandLoading && !brand && (
          <p className="text-gray-500">
            {t("brand.none")} {t("brand.configure")}
          </p>
        )}

        {!brandLoading && brand && (
          <div className="space-y-3 text-sm">
            <div>
              <strong>{t("brand.field.name")}</strong> {brand.brand_name || "—"}
            </div>
            <div>
              <strong>{t("brand.field.tagline")}</strong> {brand.brand_tagline || "—"}
            </div>
            <div>
              <strong>{t("brand.field.tone")}</strong> {brand.brand_tone || "—"}
            </div>
            <div>
              <strong>{t("brand.field.formality")}</strong> {brand.formality_level || "—"}
            </div>
            <div>
              <strong>{t("brand.field.audience")}</strong> {brand.primary_audience || "—"}
            </div>
            <div>
              <strong>{t("brand.field.personality")}</strong> {brand.brand_personality || "—"}
            </div>
            <div>
              <strong>{t("brand.field.primaryLanguage")}</strong> {brand.primary_language || "—"}
            </div>
            <div>
              <strong>{t("brand.field.culturalNotes")}</strong> {brand.cultural_notes || "—"}
            </div>
            <div>
              <strong>{t("brand.field.colors")}</strong>{" "}
              {(brand.preferred_colors || []).join(", ") || "—"}
            </div>
            <div>
              <strong>{t("brand.field.layoutStyle")}</strong> {brand.layout_style || "—"}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
