// saas/components/session/SessionTipsDocsSection.tsx
// Drop into the docs page. Renders the full long-project workflow.

import { getSessionTipsCopy, type Locale } from "@/lib/i18n/session-tips";

interface Props {
  locale?: Locale;
}

export function SessionTipsDocsSection({ locale = "en" }: Props) {
  const copy = getSessionTipsCopy(locale);

  return (
    <section
      id="long-sessions"
      className="prose prose-slate max-w-none dark:prose-invert"
    >
      <h2>{copy.docsHeading}</h2>
      <p>{copy.docsIntro}</p>
      <ol>
        {copy.bannerTips.map((tip, i) => (
          <li key={i}>{tip}</li>
        ))}
      </ol>
    </section>
  );
}
