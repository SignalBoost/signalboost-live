'use client'

import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function ReviewsPage() {
  const { t, locale } = useTranslation()
  const rating = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(4.8)

  return (
    <CockpitModulePage module={getModuleByKey('reviews')!} primaryActionKey="reviews.primaryAction" checklistPrefix="reviews.checklist" previewPrefix="reviews.preview">
      <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/80">
        <p>{t('reviews.ratingLabel', '', { rating, max: 5 })}</p>
        <p className="mt-2">{'★★★★★'} · {t('reviews.feedbackLabel', '', { feedback: t('reviews.sampleFeedback') })}</p>
      </div>
    </CockpitModulePage>
  )
}
