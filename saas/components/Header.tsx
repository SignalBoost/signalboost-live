'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

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
  en: { podcasters: uiText('generatedUi.u_0d74ad5328bfdd35'), pricing: uiText('generatedUi.u_dfe95783edfef791'), docs: uiText('generatedUi.u_7af023c43013b9a5'), dashboard: uiText('generatedUi.u_67b696468610b879'), faq: uiText('generatedUi.u_dbc468a14b601d5d'), getStarted: uiText('generatedUi.u_61e8d44ad423a4a0') },
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
