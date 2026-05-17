"use client";

import { TTSPlayer } from "@/components/audio/TTSPlayer";
import { useTranslation } from "@/components/i18n/useTranslation";

// Skip static prerendering — this page needs the user session and i18n context,
// both of which are only available at request time.
export const dynamic = "force-dynamic";

export default function AudioPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {t("audio.pageTitle", "Audio")}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t(
            "audio.pageSubtitle",
            "Turn your text into natural-sounding audio. Pick a language, choose a voice, generate."
          )}
        </p>
      </header>

      <TTSPlayer />
    </div>
  );
}
