// saas/components/session/SessionTipsBanner.tsx
// Dismissible banner shown on the dashboard.
// Also surfaces a stronger warning once the session crosses 2 hours.

"use client";

import { useEffect, useState } from "react";
import { getSessionTipsCopy, type Locale } from "@/lib/i18n/session-tips";
import { useSessionTimer } from "@/hooks/useSessionTimer";

const DISMISSED_KEY = "sb_session_tips_dismissed";

interface Props {
  locale?: Locale;
}

export function SessionTipsBanner({ locale = "en" }: Props) {
  const copy = getSessionTipsCopy(locale);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const { isLongSession, hasWarned, acknowledgeWarning } = useSessionTimer();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
  }, []);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    }
    setDismissed(true);
  };

  // Long-session warning takes priority and is non-dismissible until acknowledged.
  if (isLongSession && !hasWarned) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 text-lg">
            ⏱️
          </span>
          <div className="flex-1">
            <p className="font-semibold">{copy.timerWarningTitle}</p>
            <p className="mt-1 text-sm opacity-90">{copy.timerWarningBody}</p>
          </div>
          <button
            type="button"
            onClick={acknowledgeWarning}
            className="rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-amber-50 transition hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
          >
            {copy.dismiss}
          </button>
        </div>
      </div>
    );
  }

  if (dismissed !== false) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-slate-800 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-lg">
          💡
        </span>
        <div className="flex-1">
          <p className="font-semibold">{copy.bannerTitle}</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed opacity-90">
            {copy.bannerTips.map((tip, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="opacity-60">
                  •
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {copy.dismiss}
        </button>
      </div>
    </div>
  );
}
