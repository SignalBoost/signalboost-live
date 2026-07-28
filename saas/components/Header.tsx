'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const BRAND = '⚡ SignalBoost'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type HeaderCopy = {
  podcasters: string
  pricing: string
  docs: string
  dashboard: string
  faq: string
  getStarted: string
}

const COPY: Record<Language, HeaderCopy> = {
  en: { podcasters: uiCopy('u_4f5a7bdcfbae0d94'), pricing: uiCopy('u_1025bf0d04a64bdb'), docs: uiCopy('u_bbc23cdefbbe5573'), dashboard: uiCopy('u_848d2ba7607ab0c3'), faq: uiCopy('u_37d1629c42b08690'), getStarted: uiCopy('u_2f35985ca6a0f226') },
  es: { podcasters: 'Podcasters', pricing: 'Precios', docs: 'Documentación', dashboard: 'Panel', faq: 'Preguntas frecuentes', getStarted: 'Comenzar' },
  pt: { podcasters: 'Podcasters', pricing: 'Preços', docs: 'Documentação', dashboard: 'Painel', faq: 'Perguntas frequentes', getStarted: 'Começar' },
  pl: { podcasters: 'Podcasterzy', pricing: 'Cennik', docs: 'Dokumentacja', dashboard: 'Panel', faq: 'Najczęstsze pytania', getStarted: 'Rozpocznij' },
  ru: { podcasters: 'Подкастеры', pricing: 'Цены', docs: 'Документация', dashboard: 'Панель', faq: 'Частые вопросы', getStarted: 'Начать' },
}

export default function Header() {
  const { lang } = useI18n()
  const copy = COPY[(lang as Language) in COPY ? (lang as Language) : 'en']

  return (
    <header className="w-full px-6 py-4 flex items-center justify-between bg-[#0f0f0f] border-b border-white/10">
      <Link href="/" className="text-white font-bold text-xl tracking-tight no-underline">{BRAND}</Link>
      <nav className="hidden md:flex gap-6 text-sm text-white/60">
        <Link href="/podcasters" className="hover:text-white transition">{copy.podcasters}</Link>
        <Link href="/pricing" className="hover:text-white transition">{copy.pricing}</Link>
        <Link href="/docs" className="hover:text-white transition">{copy.docs}</Link>
        <Link href="/dashboard" className="hover:text-white transition">{copy.dashboard}</Link>
      </nav>
      <div className="flex gap-3">
        <Link href="/faq" className="text-sm text-white/70 hover:text-white transition px-4 py-2">{copy.faq}</Link>
        <Link href="/dashboard" className="text-sm bg-yellow-400 text-black font-semibold px-4 py-2 rounded-full hover:bg-yellow-300 transition">{copy.getStarted}</Link>
      </div>
    </header>
  )
}
