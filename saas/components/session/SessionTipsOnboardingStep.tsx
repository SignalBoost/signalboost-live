// saas/components/session/SessionTipsOnboardingStep.tsx
// Step for the onboarding wizard. Wizard is skippable + one-time per project rules,
// so this is best placed near the end as a "before you go" tip.

"use client";

import { getSessionTipsCopy, type Locale } from "@/lib/i18n/session-tips";

interface Props {
  locale?: Locale;
  onContinue: () => void;
  onSkip?: () => void;
}

export function SessionTipsOnboardingStep({
  locale = "en",
  onContinue,
  onSkip,
}: Props) {
  const copy = getSessionTipsCopy(locale);

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {copy.bannerTitle}
        </h2>
        <p className="text-sm opacity-75">{copy.docsIntro}</p>
      </header>

      <ul className="space-y-3 text-sm leading-relaxed">
        {copy.bannerTips.map((tip, i) => (
          <li
            key={i}
            className="flex gap-3 rounded-lg border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
            >
              {i + 1}
            </span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-end gap-3 pt-2">
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-medium opacity-70 hover:opacity-100"
          >
            {copy.dismiss}
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          →
        </button>
      </div>
    </div>
  );
}
