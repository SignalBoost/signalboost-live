// saas/components/audio/TTSPlayer.tsx
// User-facing TTS UI: text input, voice picker, generate button, audio player.
// Uses useTranslation() with English fallbacks so it works in English today
// and lights up per language as native copy is added to the i18n dictionaries.

"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useTTS } from "@/hooks/useTTS";
import {
  CURATED_VOICES,
  type CuratedVoice,
  type VoiceLocale,
} from "@/lib/elevenlabs/voices";

const MAX_CHARS = 5000;

interface Props {
  /** Optional initial language filter for the voice list. */
  initialLocale?: VoiceLocale | "all";
}

export function TTSPlayer({ initialLocale = "all" }: Props) {
  const { t } = useTranslation();
  const { generate, loading, error, result } = useTTS();

  const [text, setText] = useState("");
  const [localeFilter, setLocaleFilter] = useState<VoiceLocale | "all">(
    initialLocale,
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    CURATED_VOICES[0]?.id ?? "",
  );

  // Voices filtered by language picker.
  const visibleVoices = useMemo(() => {
    if (localeFilter === "all") return CURATED_VOICES;
    return CURATED_VOICES.filter((v) => {
      const vl = v.locale.toLowerCase();
      const f = String(localeFilter).toLowerCase();
      return vl === f || vl.startsWith(`${f}-`);
    });
  }, [localeFilter]);

  // If filter narrows the list and current selection is no longer visible,
  // fall back to the first visible voice.
  const effectiveVoiceId = useMemo(() => {
    if (visibleVoices.some((v) => v.id === selectedVoiceId)) {
      return selectedVoiceId;
    }
    return visibleVoices[0]?.id ?? "";
  }, [visibleVoices, selectedVoiceId]);

  const charsLeft = MAX_CHARS - text.length;
  const overLimit = charsLeft < 0;
  const canSubmit = text.trim().length > 0 && !overLimit && !loading;

  const handleGenerate = async () => {
    if (!canSubmit || !effectiveVoiceId) return;
    await generate(text.trim(), effectiveVoiceId);
  };

  return (
    <div className="space-y-6">
      {/* Language filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("tts.language") || "Language"}:
        </span>
        {(
          [
            ["all", "All"],
            ["en", "English"],
            ["pt-BR", "Português (BR)"],
            ["pt-PT", "Português (PT)"],
            ["es-LATAM", "Español (LATAM)"],
            ["es-ES", "Español (ES)"],
            ["pl", "Polski"],
            ["ru", "Русский"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setLocaleFilter(value as any)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              localeFilter === value
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Voice picker */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          {t("tts.voice") || "Voice"}
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleVoices.map((v) => (
            <VoiceCard
              key={v.id}
              voice={v}
              selected={effectiveVoiceId === v.id}
              onSelect={() => setSelectedVoiceId(v.id)}
              t={t}
            />
          ))}
        </div>
        {visibleVoices.length === 0 && (
          <p className="text-sm text-slate-500">
            {t("tts.noVoices") || "No voices available for this language."}
          </p>
        )}
      </div>

      {/* Text area */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          {t("tts.text") || "Text"}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={t("tts.placeholder") || "Type or paste your text here…"}
          className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span
            className={
              overLimit
                ? "font-medium text-red-600"
                : "text-slate-500 dark:text-slate-400"
            }
          >
            {text.length} / {MAX_CHARS}
          </span>
          {overLimit && (
            <span className="text-red-600">
              {t("tts.overLimit") || "Over character limit"}
            </span>
          )}
        </div>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canSubmit}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        {loading
          ? t("tts.generating") || "Generating…"
          : t("tts.generate") || "Generate audio"}
      </button>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
        >
          <p className="font-medium">
            {t("tts.error") || "Generation failed"}
          </p>
          <p className="mt-1 opacity-90">{error.message}</p>
          {typeof error.remaining === "number" &&
            typeof error.monthlyLimit === "number" && (
              <p className="mt-1 text-xs opacity-75">
                {t("tts.remaining") || "Remaining"}: {error.remaining} /{" "}
                {error.monthlyLimit}
              </p>
            )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <audio controls src={result.audioUrl} className="w-full">
            <track kind="captions" />
          </audio>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {result.cached
                ? t("tts.fromCache") || "Served from cache"
                : t("tts.justGenerated") || "Just generated"}
            </span>
            
              href={result.audioUrl}
              download="signalboost-audio.mp3"
              className="font-medium text-slate-900 underline-offset-2 hover:underline dark:text-white"
            >
              {t("tts.download") || "Download"}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Voice card ----------

interface VoiceCardProps {
  voice: CuratedVoice;
  selected: boolean;
  onSelect: () => void;
  t: (key: string) => string;
}

function VoiceCard({ voice, selected, onSelect, t }: VoiceCardProps) {
  const description = t(voice.descriptionKey) || voice.descriptionFallback;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-lg border p-3 text-left transition ${
        selected
          ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
          : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{voice.name}</span>
        <span className="text-xs opacity-70">{voice.locale}</span>
      </div>
      <p className="mt-1 text-xs opacity-80">{description}</p>
    </button>
  );
}
