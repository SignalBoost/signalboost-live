// saas/app/dashboard/brand/page.tsx

"use client";

import { useEffect, useState } from "react";

export default function BrandSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    brand_name: "",
    brand_tagline: "",
    brand_tone: "",
    formality_level: "",
    primary_audience: "",
    brand_personality: "",
    primary_language: "",
    secondary_languages: "",
    cultural_notes: "",
    preferred_colors: "",
    layout_style: "",
    visual_notes: "",
  });

  // Load existing brand profile
  useEffect(() => {
    async function loadProfile() {
      const res = await fetch("/api/brand-profile");
      const data = await res.json();

      if (data.profile) {
        setForm({
          brand_name: data.profile.brand_name || "",
          brand_tagline: data.profile.brand_tagline || "",
          brand_tone: data.profile.brand_tone || "",
          formality_level: data.profile.formality_level || "",
          primary_audience: data.profile.primary_audience || "",
          brand_personality: data.profile.brand_personality || "",
          primary_language: data.profile.primary_language || "",
          secondary_languages: (data.profile.secondary_languages || []).join(", "),
          cultural_notes: data.profile.cultural_notes || "",
          preferred_colors: (data.profile.preferred_colors || []).join(", "),
          layout_style: data.profile.layout_style || "",
          visual_notes: data.profile.visual_notes || "",
        });
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  async function saveProfile() {
    setSaving(true);

    const payload = {
      ...form,
      secondary_languages: form.secondary_languages
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      preferred_colors: form.preferred_colors
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    await fetch("/api/brand-profile", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSaving(false);
    alert("Brand profile saved!");
  }

  if (loading) {
    return <div className="p-8 text-gray-600">Loading brand profile…</div>;
  }

  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-800">Brand Settings</h1>

      <div className="space-y-6">
        {Object.entries({
          brand_name: "Brand Name",
          brand_tagline: "Tagline",
          brand_tone: "Tone (e.g. warm, premium, friendly)",
          formality_level: "Formality (formal, neutral, casual)",
          primary_audience: "Primary Audience",
          brand_personality: "Brand Personality",
          primary_language: "Primary Language (e.g. en, pt-BR)",
          secondary_languages: "Secondary Languages (comma-separated)",
          cultural_notes: "Cultural Notes",
          preferred_colors: "Preferred Colors (comma-separated)",
          layout_style: "Layout Style (clean, bold, minimal, etc.)",
          visual_notes: "Visual Notes",
        }).map(([key, label]) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {label}
            </label>
            <input
              type="text"
              value={(form as any)[key]}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, [key]: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
            />
          </div>
        ))}
      </div>

      <button
        onClick={saveProfile}
        disabled={saving}
        className="btn-primary px-6 py-3 rounded-md bg-yellow-400 text-black font-semibold hover:bg-yellow-500 transition"
      >
        {saving ? "Saving…" : "Save Brand Profile"}
      </button>
    </div>
  );
}
