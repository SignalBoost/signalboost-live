// saas/components/session/SummarizeSessionButton.tsx
// One-click action that pre-fills the dashboard AI prompt with a
// summary request. Removes the need for users to remember the phrase.
//
// Usage: pass an `onInsertPrompt` callback that places the text into
// your dashboard's prompt input. If not provided, falls back to
// copying the prompt to clipboard.

"use client";

import { useState } from "react";
import { getSessionTipsCopy, type Locale } from "@/lib/i18n/session-tips";

interface Props {
  locale?: Locale;
  onInsertPrompt?: (prompt: string) => void;
}

export function SummarizeSessionButton({ locale = "en", onInsertPrompt }: Props) {
  const copy = getSessionTipsCopy(locale);
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    if (onInsertPrompt) {
      onInsertPrompt(copy.summarizePrompt);
      return;
    }
    try {
      await navigator.clipboard.writeText(copy.summarizePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; silently no-op.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
    >
      <span aria-hidden>📝</span>
      <span>{copied ? "✓" : copy.summarizeButton}</span>
    </button>
  );
}
