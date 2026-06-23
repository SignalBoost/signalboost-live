'use client'

import { useTranslation } from '@/components/i18n/useTranslation'

export default function TrustSignals() {
  const { t } = useTranslation()
  return (
    <section className="bg-[#0f0f0f] px-6 py-10 border-t border-white/10">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-6">
        <span className="text-white/30 text-sm">{t('trust.trustedBy', 'Trusted by')}</span>
        <span className="text-green-400 font-bold text-lg">shopify</span>
        <span className="text-blue-400 font-bold text-lg">∞ Meta</span>
        <span className="text-red-400 font-bold text-lg">yelp★</span>
      </div>
    </section>
  )
}
