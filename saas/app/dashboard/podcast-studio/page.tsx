'use client'

import OrchestrationGuide from '@/components/orchestration/OrchestrationGuide'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

export default function OptimizePodcastStudioPage() {
  const { dict } = useI18n()
  return (
    <main className="sb-page-shell sb-section">
      <section className="sb-glass" style={{ padding: 28, marginBottom: 24 }}>
        <span className="sb-eyebrow">{t(dict, 'services.podcastStudio.kicker', 'Optimize Podcast Studio')}</span>
        <h1 className="sb-h1" style={{ marginTop: 12 }}>{t(dict, 'services.podcastStudio.title', 'Episode optimization orchestration')}</h1>
        <p className="sb-body" style={{ maxWidth: 760 }}>
          {t(dict, 'services.podcastStudio.subtitle', 'Optimize podcast episodes with AI-guided audio enhancement, clip planning, show notes, i18n support, validation, and clear operator fallback.')}
        </p>
      </section>
      <OrchestrationGuide />
    </main>
  )
}
