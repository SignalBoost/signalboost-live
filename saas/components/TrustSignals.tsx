'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { uiText } from '@/lib/i18n/uiText'

export default function TrustSignals() {
  const { t } = useTranslation()
  return (
    <section className="bg-[#0f0f0f] px-6 py-10 border-t border-white/10">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-6">
        <span className="text-white/30 text-sm">{t('trust.trustedBy', "Trusted by")}</span>
        <span className="text-green-400 font-bold text-lg">{uiText('generatedUi.u_8a72266588ef612e')}</span>
        <span className="text-blue-400 font-bold text-lg">{uiText('generatedUi.u_8f721504776063b4')}</span>
        <span className="text-red-400 font-bold text-lg">{uiText('generatedUi.u_b75d99dae6c5d14c')}</span>
      </div>
    </section>
  )
}
