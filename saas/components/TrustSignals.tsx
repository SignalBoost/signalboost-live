'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function TrustSignals() {
  const { t } = useTranslation()
  return (
    <section className="bg-[#0f0f0f] px-6 py-10 border-t border-white/10">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-6">
        <span className="text-white/30 text-sm">{t('trust.trustedBy', uiCopy('u_068ca50a1a04adb0'))}</span>
        <span className="text-green-400 font-bold text-lg">{uiCopy('u_9986fb1fccd018d7')}</span>
        <span className="text-blue-400 font-bold text-lg">{uiCopy('u_4b103dd69cf1e101')}</span>
        <span className="text-red-400 font-bold text-lg">{uiCopy('u_92f5c848c6cab7e0')}</span>
      </div>
    </section>
  )
}
