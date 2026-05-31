'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { useI18n } from '@/components/i18n/I18nProvider'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { partners, type Region } from '@/lib/marketplace/partners'
import PartnerMarquee from '@/components/marketplace/PartnerMarquee'
import PartnerDescription from '@/components/marketplace/PartnerDescription'

const regions: Region[] = ['global', 'us', 'eu', 'latam']

export default function MarketplacePage() {
  const { lang, setLang } = useI18n()
  const { t } = useTranslation()
  const [region, setRegion] = useState<Region>('global')
  const categories = useMemo(() => Array.from(new Set(partners.map((partner) => partner.category))), [])
  const [category, setCategory] = useState('All')
  const visible = partners.filter((partner) => category === 'All' || partner.category === category)

  return <main className="min-h-screen bg-black p-8 text-white"><header className="flex flex-wrap items-center justify-between gap-4"><Link href="/" className="text-2xl font-black text-[#FFD700] no-underline">SignalBoost</Link><nav className="flex gap-4 text-sm"><Link href="/marketplace" className="text-[#FFD700] no-underline">{t('nav.marketplace','Marketplace')}</Link><Link href="/pricing" className="text-white/70 no-underline hover:text-white">{t('nav.pricing','Pricing')}</Link><Link href="/dashboard" className="text-white/70 no-underline hover:text-white">{t('nav.dashboard','Dashboard')}</Link></nav><LanguageSwitcher current={lang} onChange={setLang} /></header><section className="mt-14 max-w-4xl"><p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('marketplace.featured','Featured partners')}</p><h1 className="mt-4 text-5xl font-black">{t('marketplace.title','SignalBoost Marketplace')}</h1><p className="mt-5 text-xl text-white/60">{t('marketplace.subtitle','Browse verified growth partners with region-aware links and logos that load from live brand domains.')}</p></section><PartnerMarquee /><section className="mt-8 flex flex-wrap items-center gap-4 rounded-3xl border border-white/10 bg-white/[.03] p-4"><label className="text-sm text-white/70">{t('marketplace.region','Region')}<select value={region} onChange={(event) => setRegion(event.target.value as Region)} className="ml-3 rounded-xl border border-white/10 bg-black p-2 text-white">{regions.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label><div className="flex flex-wrap gap-2"><button onClick={() => setCategory('All')} className="rounded-full border border-white/10 px-3 py-2 text-sm">All</button>{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className="rounded-full border border-white/10 px-3 py-2 text-sm hover:border-[#FFD700]">{item}</button>)}</div></section><section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((partner) => <PartnerDescription key={partner.id} partner={partner} region={region} cta={t('marketplace.open','Open partner')} />)}</section><p className="mt-8 text-sm text-white/45">{t('marketplace.audit','Affiliate links are monitored safely; failures are logged without deleting partners.')}</p></main>
}
