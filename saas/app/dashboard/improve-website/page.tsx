'use client'

import OrchestrationGuide from '@/components/orchestration/OrchestrationGuide'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

export default function ImproveWebsitePage() {
  const { dict } = useI18n()
  return (
    <main className="sb-page-shell sb-section">
      <section className="sb-glass" style={{ padding: 28, marginBottom: 24 }}>
        <span className="sb-eyebrow">{t(dict, 'services.improveWebsite.kicker', 'Improve Website')}</span>
        <h1 className="sb-h1" style={{ marginTop: 12 }}>{t(dict, 'services.improveWebsite.title', 'AI website audit and fix plan')}</h1>
        <p className="sb-body" style={{ maxWidth: 760 }}>
          {t(dict, 'services.improveWebsite.subtitle', 'SignalBoost routes website improvement requests through website audit, SEO scoring, validation, telemetry, and operator fallback before recommending changes.')}
        </p>
      </section>
      <OrchestrationGuide />
    </main>
  )
}
