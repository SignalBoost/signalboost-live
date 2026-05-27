'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

export default function VideoPage() {
  const { dict } = useI18n()

  return (
    <main style={{ padding: 24, color: '#fff', background: '#050814', minHeight: '100vh' }}>
      <h1>{t(dict, 'video.title', '')}</h1>
      <p>{t(dict, 'video.subtitle', '')}</p>
      <section>
        <h2>{t(dict, 'video.generator.title', '')}</h2>
        <p>{t(dict, 'video.generator.desc', '')}</p>
      </section>
      <section>
        <h2>{t(dict, 'video.captions.title', '')}</h2>
        <p>{t(dict, 'video.captions.desc', '')}</p>
      </section>
    </main>
  )
}
