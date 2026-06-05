"use client";

import { useState } from "react";
import { useTranslation } from "@/components/i18n/useTranslation";
import ResetButton from "@/components/ResetButton";

export default function VideoGenerator() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generateVideo() {
    try {
      setLoading(true);
      setError("");
      setVideoUrl("");

      const response = await fetch("/api/fal-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate video");
      }

      const url =
        data?.video?.url ||
        data?.data?.video?.url ||
        data?.output?.video?.url ||
        data?.videos?.[0]?.url;

      if (!url) {
        throw new Error("No video URL returned");
      }

      setVideoUrl(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPrompt("");
    setVideoUrl("");
    setLoading(false);
    setError("");
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t("video.promptPlaceholder", "Describe your video...")}
        className="w-full min-h-[160px] rounded-xl border border-gray-700 bg-black p-4 text-white"
      />

      <button
        onClick={generateVideo}
        disabled={loading || !prompt}
        className="rounded-xl bg-yellow-400 px-6 py-3 font-bold text-black disabled:opacity-50"
      >
        {loading ? t("video.generating", "Generating Video...") : t("video.generate", "Generate Video")}
      </button>
      {(videoUrl || error) && <ResetButton onReset={reset} />}

      {error && (
        <div className="rounded-xl bg-red-500/20 p-4 text-red-400">
          {error}
        </div>
      )}

      {videoUrl && (
        <video
          controls
          autoPlay
          className="w-full rounded-2xl"
          src={videoUrl}
        />
      )}
    </div>
  );
}
